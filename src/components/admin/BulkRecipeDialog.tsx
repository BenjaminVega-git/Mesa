"use client"

import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import {
  listProductsWithoutRecipeAction,
  suggestRecipeAction,
  applyRecipesBulkAction,
} from "@/app/actions/inventory-actions"
import type { ProductLite, BulkRecipeEntry, BulkRecipeSummary } from "@/types/product-recipe"

const CONCURRENCY = 2

// Sugerencia con reintentos y backoff. Gemini (free tier) limita por minuto, y
// como procesamos varios productos, los últimos (los recién importados, con id
// más alto) son los que más chocan con el límite. El backoff les da tiempo.
async function suggestWithRetry(productId: number) {
  let res = await suggestRecipeAction(productId)
  let delay = 1500
  for (let attempt = 0; attempt < 3 && !res.ok; attempt++) {
    await new Promise((r) => setTimeout(r, delay))
    delay *= 2
    res = await suggestRecipeAction(productId)
  }
  return res
}

type Props = {
  open: boolean
  onClose: () => void
  onDone?: () => void
}

type Phase = "loading" | "idle" | "running" | "done"

export function BulkRecipeDialog({ open, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [products, setProducts] = useState<ProductLite[]>([])
  const [error, setError] = useState("")
  const [progress, setProgress] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [summary, setSummary] = useState<BulkRecipeSummary | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al abrir el modal
    setPhase("loading")
    setError("")
    setProgress(0)
    setFailedCount(0)
    setSummary(null)
    setProducts([])
    ;(async () => {
      const res = await listProductsWithoutRecipeAction()
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        setPhase("idle")
        return
      }
      setProducts(res.data)
      setPhase("idle")
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleGenerate() {
    const total = products.length
    if (total === 0) return
    setPhase("running")
    setError("")
    setProgress(0)
    setFailedCount(0)

    const entries: BulkRecipeEntry[] = []
    let failed = 0
    let idx = 0

    async function worker() {
      while (idx < total) {
        const p = products[idx++]
        const res = await suggestWithRetry(p.id)
        if (res.ok && res.data.length > 0) {
          entries.push({ productId: p.id, items: res.data })
        } else {
          failed++
        }
        setProgress((c) => c + 1)
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker))
    setFailedCount(failed)

    if (entries.length === 0) {
      setError("La IA no pudo sugerir recetas para estos productos. Intenta de nuevo.")
      setPhase("idle")
      return
    }

    const applyRes = await applyRecipesBulkAction(entries)
    if (!applyRes.ok) {
      setError(applyRes.error)
      setPhase("idle")
      return
    }
    setSummary(applyRes.data)
    setPhase("done")
    onDone?.()
  }

  const total = products.length
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={phase === "running"}
      size="md"
      title="Generar recetas con IA"
      description="Gemini propone los insumos de cada producto sin receta y los crea en inventario."
    >
      {phase === "loading" ? (
        <p className="py-6 text-center text-sm text-stone-500">Buscando productos sin receta...</p>
      ) : phase === "done" && summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Recetas</p>
              <p className="mt-0.5 text-2xl font-extrabold text-emerald-700">{summary.recipesSaved}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Insumos creados</p>
              <p className="mt-0.5 text-2xl font-extrabold text-sky-700">{summary.ingredientsCreated}</p>
            </div>
          </div>

          {failedCount > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {failedCount} producto{failedCount === 1 ? "" : "s"} sin sugerencia (se omitieron).
            </p>
          )}

          <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            Los insumos nuevos quedaron en <b>stock 0</b>, así que esos productos aparecerán como
            <b> agotados</b> hasta que cargues stock (manual o importando una compra).
          </p>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600"
            >
              Listo
            </button>
          </div>
        </div>
      ) : phase === "running" ? (
        <div className="space-y-3 py-2">
          <p className="text-center text-sm font-semibold text-stone-700">
            {progress < total ? `Sugiriendo recetas… ${progress}/${total}` : "Guardando recetas…"}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-violet-500 transition-all"
              style={{ width: `${progress < total ? pct : 100}%` }}
            />
          </div>
          <p className="text-center text-[11px] text-stone-400">
            Son varias llamadas a Gemini, puede tardar un momento.
          </p>
        </div>
      ) : (
        // idle
        <div className="space-y-4">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          {total === 0 ? (
            <p className="py-4 text-center text-sm text-stone-600">
              🎉 Todos tus productos ya tienen receta.
            </p>
          ) : (
            <>
              <p className="text-sm text-stone-700">
                Hay <span className="font-bold">{total}</span> producto{total === 1 ? "" : "s"} sin
                receta. La IA propondrá insumos para cada uno y los creará en inventario (stock 0)
                para que los revises y cargues.
              </p>

              <div className="max-h-40 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-2">
                <ul className="space-y-0.5 text-xs text-stone-600">
                  {products.map((p) => (
                    <li key={p.id} className="truncate">
                      • {p.name}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-violet-700"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Generar {total} receta{total === 1 ? "" : "s"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
