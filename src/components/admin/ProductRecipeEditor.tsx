"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import {
  getProductRecipeAction,
  listIngredientsAction,
  setProductRecipeAction,
  createIngredientAction,
  suggestRecipeAction,
} from "@/app/actions/inventory-actions"
import { baseUnitLabel } from "@/lib/inventory/units"
import type { IngredientWithFlag, IngredientUnit } from "@/types/ingredient"
import type { ProductRecipeData, SuggestedRecipeItem } from "@/types/product-recipe"

// Una línea de receta: insumo existente (ingredientId) o uno nuevo sugerido por
// la IA (newName/newUnit) que se creará en inventario a stock 0 al guardar.
type RecipeLine = {
  ingredientId: number | ""
  newName?: string
  newUnit?: IngredientUnit
  cantidad: string
  // Insumo crítico (true) u opcional (false): un opcional no bloquea la venta.
  bloquea: boolean
}

type Props = {
  productId: number
  // Si es true, dispara la sugerencia con IA automáticamente al abrir.
  autoSuggestAI?: boolean
  // Se llama tras auto-disparar la IA, para que el padre no la repita.
  onAutoSuggested?: () => void
  onSaved?: () => void
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function linesFromItems(items: { ingredientId: number; cantidad: number; bloquea: boolean }[]): RecipeLine[] {
  return items.map((i) => ({
    ingredientId: i.ingredientId,
    cantidad: String(i.cantidad),
    bloquea: i.bloquea,
  }))
}

function lineFromSuggestion(item: SuggestedRecipeItem): RecipeLine {
  // La IA no distingue críticos/opcionales: por defecto todo es crítico.
  return item.existingId != null
    ? { ingredientId: item.existingId, cantidad: String(item.cantidad), bloquea: true }
    : { ingredientId: "", newName: item.name, newUnit: item.unit, cantidad: String(item.cantidad), bloquea: true }
}

export function ProductRecipeEditor({
  productId,
  autoSuggestAI = false,
  onAutoSuggested,
  onSaved,
}: Props) {
  const [ingredients, setIngredients] = useState<IngredientWithFlag[]>([])
  const [data, setData] = useState<ProductRecipeData | null>(null)
  const [productLines, setProductLines] = useState<RecipeLine[]>([])
  const [variantLines, setVariantLines] = useState<Record<number, RecipeLine[]>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")
  const [aiError, setAiError] = useState("")
  const [savedOk, setSavedOk] = useState(false)
  const autoRanRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const [ingRes, recipeRes] = await Promise.all([
      listIngredientsAction(),
      getProductRecipeAction(productId),
    ])
    if (!ingRes.ok) {
      setError(ingRes.error)
      setLoading(false)
      return
    }
    if (!recipeRes.ok) {
      setError(recipeRes.error)
      setLoading(false)
      return
    }
    setIngredients(ingRes.data)
    setData(recipeRes.data)
    setProductLines(linesFromItems(recipeRes.data.productRecipe))
    const vl: Record<number, RecipeLine[]> = {}
    for (const v of recipeRes.data.variants) {
      vl[v.id] = linesFromItems(recipeRes.data.variantRecipes[v.id] ?? [])
    }
    setVariantLines(vl)
    setLoading(false)
  }, [productId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    void load()
  }, [load])

  const handleSuggest = useCallback(async () => {
    if (!data || aiLoading) return
    setAiError("")
    setSavedOk(false)
    setAiLoading(true)
    try {
      const res = await suggestRecipeAction(productId)
      if (!res.ok) {
        setAiError(res.error)
        return
      }
      if (res.data.length === 0) {
        setAiError("La IA no encontró insumos para este producto. Agrégalos manualmente.")
        return
      }
      const lines = res.data.map(lineFromSuggestion)
      if (data.hasVariants) {
        const vl: Record<number, RecipeLine[]> = {}
        for (const v of data.variants) vl[v.id] = lines.map((l) => ({ ...l }))
        setVariantLines(vl)
      } else {
        setProductLines(lines)
      }
    } finally {
      setAiLoading(false)
    }
  }, [productId, data, aiLoading])

  // Auto-sugerir al abrir si viene del flujo de creación (una sola vez).
  useEffect(() => {
    if (autoSuggestAI && !loading && data && !autoRanRef.current) {
      autoRanRef.current = true
      onAutoSuggested?.()
      void handleSuggest()
    }
  }, [autoSuggestAI, loading, data, handleSuggest, onAutoSuggested])

  const ingredientById = useMemo(() => {
    const m = new Map<number, IngredientWithFlag>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  function hasDuplicate(lines: RecipeLine[]): boolean {
    const keys = lines
      .filter((l) => l.ingredientId !== "" || l.newName)
      .map((l) => (l.ingredientId !== "" ? `id:${l.ingredientId}` : `new:${normalizeName(l.newName!)}`))
    return new Set(keys).size !== keys.length
  }

  async function handleSave() {
    if (saving || aiLoading || !data) return
    setError("")
    setSavedOk(false)

    const targets = data.hasVariants
      ? data.variants.map((v) => ({
          label: v.name,
          productId: null as number | null,
          variantId: v.id as number | null,
          lines: variantLines[v.id] ?? [],
        }))
      : [{ label: "", productId: productId as number | null, variantId: null as number | null, lines: productLines }]

    for (const t of targets) {
      if (hasDuplicate(t.lines)) {
        setError(
          data.hasVariants
            ? `No repitas el mismo insumo en "${t.label}"`
            : "No repitas el mismo insumo en la receta"
        )
        return
      }
    }

    setSaving(true)
    try {
      // 1) Crear los insumos nuevos (a stock 0), deduplicados por nombre.
      const newByKey = new Map<string, { name: string; unit: IngredientUnit }>()
      for (const t of targets) {
        for (const l of t.lines) {
          if (l.ingredientId === "" && l.newName && l.newUnit && Number(l.cantidad) > 0) {
            newByKey.set(normalizeName(l.newName), { name: l.newName, unit: l.newUnit })
          }
        }
      }
      const createdIdByKey = new Map<string, number>()
      for (const [key, info] of newByKey) {
        const res = await createIngredientAction({
          name: info.name,
          unit: info.unit,
          stockInicial: 0,
          stockMinimo: 0,
          precio: 0,
        })
        if (!res.ok) {
          setError(`No se pudo crear el insumo "${info.name}": ${res.error}`)
          return
        }
        createdIdByKey.set(key, res.data.id)
      }

      // 2) Guardar la receta de cada destino, resolviendo los insumos nuevos a su id.
      for (const t of targets) {
        const items = t.lines
          .map((l) => {
            if (l.ingredientId !== "") {
              return { ingredientId: Number(l.ingredientId), cantidad: Number(l.cantidad), bloquea: l.bloquea }
            }
            if (l.newName) {
              const id = createdIdByKey.get(normalizeName(l.newName))
              if (id) return { ingredientId: id, cantidad: Number(l.cantidad), bloquea: l.bloquea }
            }
            return null
          })
          .filter(
            (it): it is { ingredientId: number; cantidad: number; bloquea: boolean } =>
              it !== null && it.cantidad > 0
          )

        const res = await setProductRecipeAction({ productId: t.productId, variantId: t.variantId, items })
        if (!res.ok) {
          setError(data.hasVariants ? `Error guardando "${t.label}": ${res.error}` : res.error)
          return
        }
      }

      setSavedOk(true)
      onSaved?.()
      await load() // refrescar para reflejar los insumos recién creados
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="py-6 text-center text-sm text-stone-500">Cargando receta...</p>
  }

  const noLines =
    productLines.length === 0 && Object.values(variantLines).every((arr) => arr.length === 0)
  const showEmptyHint = ingredients.length === 0 && noLines
  const busy = saving || aiLoading

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-stone-600">
          Define qué insumos consume cada unidad vendida y marca cuáles son{" "}
          <span className="font-semibold">críticos</span> u{" "}
          <span className="font-semibold">opcionales</span>. Al venderse, el stock se descuenta solo;
          un insumo crítico agota/bloquea el producto si no alcanza (según el modo de stock del local),
          uno opcional no. Sin insumos asignados, el producto no descuenta nada.
        </p>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {aiLoading ? (
            "Generando..."
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Sugerir con IA
            </>
          )}
        </button>
      </div>

      {aiError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {aiError}
        </p>
      )}

      {showEmptyHint ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-stone-700">Aún no tienes insumos</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-stone-500">
            Usa <span className="font-bold text-violet-700">Sugerir con IA</span> para generar la
            receta y crear los insumos automáticamente, o créalos a mano en Inventario.
          </p>
          <Link
            href="/admin/inventory"
            className="mt-4 inline-block rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-50"
          >
            Ir a Inventario
          </Link>
        </div>
      ) : (
        <>
          {data?.hasVariants ? (
            <div className="space-y-4">
              {data.variants.map((v) => (
                <TargetEditor
                  key={v.id}
                  title={v.name}
                  lines={variantLines[v.id] ?? []}
                  ingredients={ingredients}
                  ingredientById={ingredientById}
                  disabled={busy}
                  onChange={(lines) => setVariantLines((prev) => ({ ...prev, [v.id]: lines }))}
                />
              ))}
            </div>
          ) : (
            <TargetEditor
              lines={productLines}
              ingredients={ingredients}
              ingredientById={ingredientById}
              disabled={busy}
              onChange={setProductLines}
            />
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}
          {savedOk && !error && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              Receta guardada.
            </p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar receta"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

type TargetEditorProps = {
  title?: string
  lines: RecipeLine[]
  ingredients: IngredientWithFlag[]
  ingredientById: Map<number, IngredientWithFlag>
  disabled: boolean
  onChange: (lines: RecipeLine[]) => void
}

function TargetEditor({ title, lines, ingredients, ingredientById, disabled, onChange }: TargetEditorProps) {
  function setLine(idx: number, patch: Partial<RecipeLine>) {
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function addLine() {
    onChange([...lines, { ingredientId: "", cantidad: "", bloquea: true }])
  }
  function removeLine(idx: number) {
    onChange(lines.filter((_, i) => i !== idx))
  }

  // Costo de la receta: suma de precio(por base) × cantidad. Solo se muestra si
  // TODOS los insumos asignados tienen precio (y ninguno es un insumo nuevo aún
  // sin crear, que arranca en precio 0).
  const costedLines = lines.filter((l) => l.ingredientId !== "" && Number(l.cantidad) > 0)
  const hasPendingNew = lines.some((l) => l.ingredientId === "" && l.newName && Number(l.cantidad) > 0)
  let recipeCost = 0
  let allPriced = costedLines.length > 0 && !hasPendingNew
  for (const l of costedLines) {
    const precio = ingredientById.get(Number(l.ingredientId))?.precio ?? 0
    if (precio <= 0) allPriced = false
    recipeCost += precio * Number(l.cantidad)
  }
  const hasItems = costedLines.length > 0 || hasPendingNew

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      {title && <p className="mb-2 text-xs font-bold text-stone-700">{title}</p>}

      {lines.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-stone-400">Sin insumos asignados</p>
      ) : (
        <div className="space-y-2">
          {lines.map((line, idx) => {
            const isNew = line.ingredientId === "" && !!line.newName
            const selected =
              line.ingredientId !== "" ? ingredientById.get(Number(line.ingredientId)) : undefined
            const unitLabel = isNew
              ? baseUnitLabel(line.newUnit!)
              : selected
                ? baseUnitLabel(selected.unit)
                : ""
            return (
              <div key={idx} className="flex items-center gap-2">
                {isNew ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2">
                    <span className="truncate text-sm text-stone-800">{line.newName}</span>
                    <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                      ✨ nuevo
                    </span>
                  </div>
                ) : (
                  <select
                    disabled={disabled}
                    value={line.ingredientId}
                    onChange={(e) =>
                      setLine(idx, { ingredientId: e.target.value ? Number(e.target.value) : "" })
                    }
                    className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
                  >
                    <option value="">Selecciona un insumo</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex w-28 shrink-0 items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={disabled}
                    placeholder="cant."
                    value={line.cantidad}
                    onChange={(e) => setLine(idx, { cantidad: e.target.value })}
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-sm text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
                  />
                  <span className="w-7 shrink-0 text-[11px] font-medium text-stone-500">{unitLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLine(idx, { bloquea: !line.bloquea })}
                  disabled={disabled}
                  title={
                    line.bloquea
                      ? "Crítico: si falta, el producto se agota/bloquea"
                      : "Opcional: si falta, el producto sigue disponible"
                  }
                  className={`shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-bold transition disabled:opacity-50 ${
                    line.bloquea
                      ? "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  {line.bloquea ? "crítico" : "opcional"}
                </button>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={disabled}
                  aria-label="Quitar insumo"
                  className="shrink-0 rounded-lg p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={addLine}
          disabled={disabled}
          className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
        >
          + Agregar insumo
        </button>
        {hasItems &&
          (allPriced ? (
            <span className="text-[11px] font-bold text-stone-700">
              Costo receta:{" "}
              <span className="text-emerald-700">
                ${recipeCost.toLocaleString("es-CL", { maximumFractionDigits: 0 })}
              </span>
            </span>
          ) : (
            <span className="text-[11px] text-stone-400">Asigna precio a todos los insumos</span>
          ))}
      </div>
    </div>
  )
}
