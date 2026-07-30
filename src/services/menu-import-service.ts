"use server"

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { z } from "zod"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { ok, fail, type Result } from "@/services/result"
import { cloudinary } from "@/lib/cloudinary/config"
import { fetchImageSafely } from "@/lib/security/safe-image-url"
import { logger } from "@/lib/logger"
import { checkMenuImportLimit, checkGeminiGlobalLimit } from "@/lib/rate-limit"

// ============ TYPES ============

const ParsedVariantSchema = z.object({
  name: z.string().trim().min(1).max(60),
  price: z.number().int().nonnegative(),
})

const ParsedProductSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  price: z.number().int().nonnegative(),
  category_name: z.string().trim().min(1).max(60),
  variants: z.array(ParsedVariantSchema).max(20).default([]),
  image_url: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          const url = new URL(u)
          return url.protocol === "https:" && url.hostname === "images.pexels.com"
        } catch {
          return false
        }
      },
      { message: "URL de imagen no permitida" }
    )
    .nullable()
    .optional()
    .default(null),
})

const ParsedMenuSchema = z.object({
  categories: z.array(z.string().trim().min(1).max(60)).max(40),
  products: z.array(ParsedProductSchema).max(200),
})

export type ParsedMenu = z.infer<typeof ParsedMenuSchema>
export type ParsedProduct = z.infer<typeof ParsedProductSchema>

// ============ PARSE (Gemini Vision) ============

const ParseInputSchema = z.object({
  images: z
    .array(
      z.object({
        mimeType: z.string().regex(/^image\//, "Tipo inválido"),
        base64: z.string().min(1),
      })
    )
    .min(1, "Subí al menos una imagen")
    .max(6, "Máximo 6 imágenes por carta"),
})

export type ParseInput = z.infer<typeof ParseInputSchema>

const SYSTEM_PROMPT = `Sos un asistente que extrae datos estructurados de una carta de restaurante chileno.

REGLAS IMPORTANTES:
- Devolvé SOLO los productos visibles en la imagen. No inventes nada.
- Los precios están en pesos chilenos (CLP). Devolvelos como ENTEROS sin puntos, comas ni símbolo. Ej: "$8.990" → 8990.
- Si un producto tiene múltiples tamaños/variantes con distinto precio (ej. "Pizza Chica $X / Mediana $Y / Grande $Z"), creá UN solo producto con sus variantes. NO crees productos separados.
- En ese caso, el "price" del producto debe ser igual al precio de la primera variante (servirá de fallback).
- Si un producto NO tiene variantes, dejá "variants" como [].
- Si no hay descripción visible, dejá "description" como null.
- Agrupá productos en categorías ya sea por los títulos de la carta o, si no los hay, por tipo (Entradas, Platos, Bebidas, Postres, etc).
- "category_name" de cada producto debe coincidir EXACTAMENTE con alguno de los strings en "categories".
- Mantené nombres de productos breves (idealmente bajo 50 caracteres). Cortá títulos demasiado largos.`

export async function parseMenuImage(input: ParseInput): Promise<Result<ParsedMenu>> {
  const parsed = ParseInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fail("GEMINI_API_KEY no configurada en el server")

  // Es la operación más pesada de las 4 que comparten GEMINI_API_KEY (hasta 6
  // imágenes por llamada) — límite propio por restaurante, además del
  // presupuesto global compartido con el chat de Manuel y las otras IAs.
  const restaurantLimit = await checkMenuImportLimit(auth.data.restaurantId)
  if (!restaurantLimit.success) {
    return fail("Alcanzaste el límite de importaciones de menú de tu restaurante. Probá de nuevo más tarde.")
  }
  const globalLimit = await checkGeminiGlobalLimit()
  if (!globalLimit.success) {
    return fail("El servicio de IA está con mucha demanda en este momento. Probá de nuevo en unos segundos.")
  }

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
            categories: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            products: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  name: { type: SchemaType.STRING },
                  description: { type: SchemaType.STRING, nullable: true },
                  price: { type: SchemaType.INTEGER },
                  category_name: { type: SchemaType.STRING },
                  variants: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        name: { type: SchemaType.STRING },
                        price: { type: SchemaType.INTEGER },
                      },
                      required: ["name", "price"],
                    },
                  },
                },
                required: ["name", "price", "category_name", "variants"],
              },
            },
          },
          required: ["categories", "products"],
        },
      },
    })

    const imageParts = parsed.data.images.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    }))

    const result = await model.generateContent([
      ...imageParts,
      { text: "Extraé las categorías y productos de esta carta." },
    ])

    const text = result.response.text()
    const json = JSON.parse(text)

    const validated = ParsedMenuSchema.safeParse(json)
    if (!validated.success) {
      return fail("La IA devolvió un formato inesperado. Probá con otra imagen.")
    }

    // Pre-fetch fotos stock de Pexels en paralelo. Si falla algún match queda en null.
    const imageUrls = await Promise.all(
      validated.data.products.map((p) =>
        fetchPexelsImages(p.name, 1).then((arr) => arr[0] ?? null)
      )
    )
    const withImages: ParsedMenu = {
      ...validated.data,
      products: validated.data.products.map((p, i) => ({
        ...p,
        image_url: imageUrls[i],
      })),
    }

    return ok(withImages)
  } catch (err) {
    return fail(
      err instanceof Error
        ? `Error al procesar la imagen: ${err.message}`
        : "Error al procesar la imagen"
    )
  }
}

// ============ BULK INSERT ============

export type ImportSummary = {
  categoriesCreated: number
  categoriesReused: number
  productsCreated: number
  variantsCreated: number
  imagesFound: number
  skipped: string[]
}

// Busca fotos stock en Pexels que matcheen con el nombre del producto.
// Devuelve array vacío si no hay match, falla la red, o no hay API key configurada.
async function fetchPexelsImages(query: string, perPage = 1): Promise<string[]> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return []

  const cleaned = query.trim().toLowerCase()
  if (!cleaned) return []

  // "close up" sesga a fotos con un solo producto en primer plano
  // (en vez de mesas con varios platos como hacía "food").
  const searchQuery = `${cleaned} close up`

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=${perPage}&orientation=square`,
      { headers: { Authorization: apiKey }, cache: "no-store" }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      photos?: Array<{ src?: { medium?: string; large?: string } }>
    }
    return (data.photos ?? [])
      .map((p) => p.src?.large ?? p.src?.medium ?? null)
      .filter((u): u is string => !!u)
  } catch {
    return []
  }
}

// Descarga una imagen desde una URL pública, le quita el fondo con remove.bg
// y sube el PNG resultante a Cloudinary. Devuelve null si cualquier paso falla
// (caller debe usar la URL original como fallback).
async function processWithRemoveBg(
  imageUrl: string,
  restaurantId: number
): Promise<{ url: string; publicId: string } | null> {
  const removeBgKey = process.env.REMOVEBG_API_KEY
  if (!removeBgKey) return null

  try {
    // 1. Descargar la imagen original (validación SSRF: host whitelist,
    //    sin redirects, con timeout y límite de bytes)
    let imageBlob: Blob
    try {
      imageBlob = await fetchImageSafely(imageUrl)
    } catch {
      return null // URL no segura o descarga falló -> caller usa la URL original como fallback
    }

    // 2. Mandar a remove.bg
    const form = new FormData()
    form.append("image_file", imageBlob)
    form.append("size", "auto")

    const removeBgRes = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": removeBgKey },
      body: form,
    })
    if (!removeBgRes.ok) return null
    const pngBuffer = Buffer.from(await removeBgRes.arrayBuffer())

    // 3. Subir el PNG a Cloudinary
    const uploaded = await new Promise<{ secure_url: string; public_id: string } | null>(
      (resolve) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: `mesa/${restaurantId}/imports`, resource_type: "image" },
          (error, result) => {
            if (error || !result) {
              resolve(null)
              return
            }
            resolve({ secure_url: result.secure_url, public_id: result.public_id })
          }
        )
        stream.end(pngBuffer)
      }
    )

    if (!uploaded) return null
    return { url: uploaded.secure_url, publicId: uploaded.public_id }
  } catch {
    return null
  }
}

// Server action separada para que el cliente pueda pedir alternativas a una imagen.
export async function searchPexelsImages(query: string): Promise<Result<string[]>> {
  if (!query || query.trim().length < 2) return ok([])
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const urls = await fetchPexelsImages(query, 8)
  return ok(urls)
}

const BulkImportInputSchema = ParsedMenuSchema.extend({
  removeBackground: z.boolean().optional().default(false),
})

export type BulkImportInput = z.infer<typeof BulkImportInputSchema>

// Procesa una lista de tareas async con un tope de concurrencia (pool).
// Evita disparar cientos de llamadas externas (remove.bg/Cloudinary) a la vez.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const current = cursor
      cursor += 1
      results[current] = await worker(items[current], current)
    }
  }

  const pool = Array.from({ length: Math.min(limit, items.length) }, () => run())
  await Promise.all(pool)
  return results
}

export async function bulkImportMenu(input: BulkImportInput): Promise<Result<ImportSummary>> {
  const parsed = BulkImportInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)

  const { supabase, restaurantId } = auth.data
  const { removeBackground } = parsed.data

  // 1) Resolver imágenes ANTES (fuera de la transacción). Si removeBackground
  //    está activo, cada imagen pasa por remove.bg + Cloudinary, con un tope
  //    de 4 en paralelo (antes eran todas a la vez).
  const processedImages = new Map<number, { url: string; publicId: string | null }>()
  if (removeBackground) {
    await mapWithConcurrency(parsed.data.products, 4, async (p, i) => {
      if (!p.image_url) return
      const result = await processWithRemoveBg(p.image_url, restaurantId)
      if (result) {
        processedImages.set(i, { url: result.url, publicId: result.publicId })
      } else {
        // Fallback: mantener la URL original (Pexels).
        processedImages.set(i, { url: p.image_url, publicId: null })
      }
    })
  }

  // 2) Armar el payload para la RPC transaccional, con las URLs ya resueltas.
  const payload = {
    categories: parsed.data.categories,
    products: parsed.data.products.map((p, i) => {
      const processed = processedImages.get(i)
      return {
        name: p.name,
        description: p.description ?? null,
        price: p.price,
        category_name: p.category_name,
        image_url: processed?.url ?? p.image_url ?? null,
        image_public_id: processed?.publicId ?? null,
        variants: p.variants.map((v) => ({ name: v.name, price: v.price })),
      }
    }),
  }

  // 3) Un solo insert atómico: o entra el menú completo, o no entra nada.
  const { data, error } = await supabase.rpc("import_menu_bulk", {
    p_payload: payload,
  })

  if (error) {
    logger.error("Error importando menú (RPC)", error)
    return fail(error.message ?? "No se pudo importar el menú")
  }

  const r = data as {
    categories_created: number
    categories_reused: number
    products_created: number
    variants_created: number
    images_found: number
  } | null

  const summary: ImportSummary = {
    categoriesCreated: r?.categories_created ?? 0,
    categoriesReused: r?.categories_reused ?? 0,
    productsCreated: r?.products_created ?? 0,
    variantsCreated: r?.variants_created ?? 0,
    imagesFound: r?.images_found ?? 0,
    skipped: [], // con import atómico ya no hay "parciales": todo o nada.
  }

  return ok(summary)
}