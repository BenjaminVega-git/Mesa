import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { z } from "zod"
import { ok, fail, type Result } from "@/services/result"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { checkRecipeAiLimit, checkGeminiGlobalLimit } from "@/lib/rate-limit"
import type { IngredientUnit } from "@/types/ingredient"
import type { SuggestedRecipeItem } from "@/types/product-recipe"

const SYSTEM_PROMPT = `Eres un chef experto en costos y fichas técnicas de restaurantes.
Dado un producto del menú, devuelves los INSUMOS (materia prima) que consume UNA
unidad vendida, con cantidades realistas.

Reglas:
- Solo insumos/ingredientes de cocina o bar, NUNCA el producto terminado.
- Nombres cortos y genéricos en español (ej: "Pan de hamburguesa", "Carne de vacuno", "Queso cheddar", "Aceite").
- "unit" debe ser exactamente uno de: "unidad" (piezas enteras), "g" (peso en gramos), "ml" (volumen en mililitros).
- "cantidad" es por 1 unidad vendida del producto, un número positivo en esa unidad base (ej: 150 g de carne, 1 unidad de pan, 30 ml de salsa).
- Entre 1 y 12 insumos. Si no puedes inferir nada razonable, devuelve una lista vacía.`

const AiItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.enum(["unidad", "g", "ml"]),
  cantidad: z.number().positive().max(10_000_000),
})
const AiResponseSchema = z.object({ items: z.array(AiItemSchema).max(50) })

// Normaliza para matchear nombres de insumo (minúsculas, sin acentos ni espacios extra).
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export async function suggestProductRecipe(
  productId: number
): Promise<Result<SuggestedRecipeItem[]>> {
  if (!productId || productId <= 0) return fail("Producto no encontrado")

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase, restaurantId } = auth.data

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("product_name, product_description, restaurant_id, categories(category_name)")
    .eq("id", productId)
    .maybeSingle()
  if (pErr) return fail(pErr.message)
  if (!product || product.restaurant_id !== restaurantId) return fail("Producto no encontrado")

  const { data: existing, error: iErr } = await supabase
    .from("ingredients")
    .select("id, name, unit")
    .eq("restaurant_id", restaurantId)
  if (iErr) return fail(iErr.message)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fail("GEMINI_API_KEY no configurada en el server")

  // Límite propio por restaurante (se puede invocar en lote, un producto a la
  // vez, desde BulkRecipeDialog) + presupuesto global compartido con Manuel y
  // las otras IAs de la misma GEMINI_API_KEY.
  const restaurantLimit = await checkRecipeAiLimit(restaurantId)
  if (!restaurantLimit.success) {
    return fail("Alcanzaste el límite de sugerencias de receta de tu restaurante. Probá de nuevo más tarde.")
  }
  const globalLimit = await checkGeminiGlobalLimit()
  if (!globalLimit.success) {
    return fail("El servicio de IA está con mucha demanda en este momento. Probá de nuevo en unos segundos.")
  }

  const rawCat = product.categories as
    | { category_name: string }
    | { category_name: string }[]
    | null
  const catName = Array.isArray(rawCat) ? rawCat[0]?.category_name : rawCat?.category_name

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            items: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  name: { type: SchemaType.STRING },
                  unit: { type: SchemaType.STRING },
                  cantidad: { type: SchemaType.NUMBER },
                },
                required: ["name", "unit", "cantidad"],
              },
            },
          },
          required: ["items"],
        },
      },
    })

    const prompt = `Producto: ${product.product_name}
Descripción: ${product.product_description ?? "(sin descripción)"}
Categoría: ${catName ?? "(sin categoría)"}

Lista los insumos que consume UNA unidad vendida de este producto.`

    const result = await model.generateContent([{ text: prompt }])
    const json = JSON.parse(result.response.text())
    const validated = AiResponseSchema.safeParse(json)
    if (!validated.success) {
      return fail("La IA devolvió un formato inesperado. Intenta de nuevo.")
    }

    // Matchear cada sugerencia contra los insumos existentes (por nombre normalizado).
    const byNorm = new Map<string, { id: number; name: string; unit: IngredientUnit }>()
    for (const ing of existing ?? []) {
      byNorm.set(normalize(ing.name), {
        id: ing.id as number,
        name: ing.name as string,
        unit: ing.unit as IngredientUnit,
      })
    }

    const items: SuggestedRecipeItem[] = validated.data.items.map((it) => {
      const match = byNorm.get(normalize(it.name))
      return match
        ? { name: match.name, unit: match.unit, cantidad: it.cantidad, existingId: match.id }
        : { name: it.name, unit: it.unit, cantidad: it.cantidad, existingId: null }
    })

    return ok(items)
  } catch (err) {
    return fail(
      err instanceof Error ? `Error de la IA: ${err.message}` : "Error al sugerir la receta"
    )
  }
}
