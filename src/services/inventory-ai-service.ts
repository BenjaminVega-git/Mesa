import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { z } from "zod"
import { ok, fail, type Result } from "@/services/result"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { checkInventoryAiLimit, checkGeminiGlobalLimit } from "@/lib/rate-limit"

export type HeaderColumnMap = {
  name: number
  unit: number
  stock: number
  min: number
  price: number
}

const SYSTEM_PROMPT = `Eres un asistente que mapea columnas de un CSV de inventario de insumos de un restaurante.
Te dan los encabezados (con su índice basado en 0) y filas de ejemplo. Identifica qué columna corresponde a cada campo:
- name: nombre del insumo (ej: "Pan", "Carne de vacuno")
- unit: unidad de medida (ej: "unidad", "kg", "g", "ml", "L")
- stock: cantidad o existencia actual
- min: stock mínimo de alerta
- price: precio o costo del insumo (ej: "precio", "costo", "valor")

Devuelve el índice (basado en 0) de cada campo. Usa -1 si el campo no está presente.
'name' y 'unit' son obligatorios; si no puedes identificarlos, devuélvelos igual con tu mejor estimación.`

const ResultSchema = z.object({
  nameIdx: z.number().int(),
  unitIdx: z.number().int(),
  stockIdx: z.number().int(),
  minIdx: z.number().int(),
  priceIdx: z.number().int(),
})

export async function mapInventoryHeaders(
  headers: string[],
  sampleRows: string[][]
): Promise<Result<HeaderColumnMap>> {
  if (!headers || headers.length === 0) return fail("Sin encabezados que mapear")

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fail("GEMINI_API_KEY no configurada en el server")

  const restaurantLimit = await checkInventoryAiLimit(auth.data.restaurantId)
  if (!restaurantLimit.success) {
    return fail("Alcanzaste el límite de mapeos de inventario con IA de tu restaurante. Probá de nuevo más tarde.")
  }
  const globalLimit = await checkGeminiGlobalLimit()
  if (!globalLimit.success) {
    return fail("El servicio de IA está con mucha demanda en este momento. Probá de nuevo en unos segundos.")
  }

  const cols = headers.slice(0, 40)
  const samples = sampleRows.slice(0, 3)

  const headerList = cols.map((h, i) => `${i}: "${h}"`).join("\n")
  const sampleText = samples
    .map(
      (r, ri) =>
        `Fila ${ri + 1}: ${cols.map((_, i) => `[${i}]="${(r[i] ?? "").slice(0, 40)}"`).join(", ")}`
    )
    .join("\n")

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
            nameIdx: { type: SchemaType.INTEGER },
            unitIdx: { type: SchemaType.INTEGER },
            stockIdx: { type: SchemaType.INTEGER },
            minIdx: { type: SchemaType.INTEGER },
            priceIdx: { type: SchemaType.INTEGER },
          },
          required: ["nameIdx", "unitIdx", "stockIdx", "minIdx", "priceIdx"],
        },
      },
    })

    const prompt = `Encabezados:\n${headerList}\n\nEjemplos:\n${sampleText || "(sin ejemplos)"}`
    const result = await model.generateContent([{ text: prompt }])
    const json = JSON.parse(result.response.text())
    const v = ResultSchema.safeParse(json)
    if (!v.success) return fail("La IA devolvió un formato inesperado.")

    const n = cols.length
    const inRange = (x: number) => (x >= 0 && x < n ? x : -1)
    const name = inRange(v.data.nameIdx)
    const unit = inRange(v.data.unitIdx)
    if (name < 0 || unit < 0) {
      return fail("La IA no pudo identificar las columnas de Nombre y Unidad.")
    }
    return ok({
      name,
      unit,
      stock: inRange(v.data.stockIdx),
      min: inRange(v.data.minIdx),
      price: inRange(v.data.priceIdx),
    })
  } catch (err) {
    return fail(err instanceof Error ? `Error de la IA: ${err.message}` : "Error al mapear columnas")
  }
}
