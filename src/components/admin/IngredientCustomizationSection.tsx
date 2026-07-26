"use client"

import { useEffect, useState } from "react"
import {
  listProductsLiteAction,
  getIngredientOptionsAction,
  saveIngredientOptionsAction,
} from "@/app/actions/inventory-actions"
import type { ProductLite } from "@/types/product-recipe"
import type { IngredientOptionConfigRow } from "@/types/product"

const UNIT_LABEL: Record<string, string> = { unidad: "un.", g: "g", ml: "ml" }

/**
 * Personalización de ingredientes por producto: cuáles puede quitar el
 * comensal (gratis) y cuáles puede agregar (con precio y el stock que
 * consume). El insumo es el mismo de Inventario; esto solo lo habilita para
 * un producto puntual. Se ve en el menú QR y en el POS del mesero.
 */
export function IngredientCustomizationSection() {
  const [products, setProducts] = useState<ProductLite[]>([])
  const [productId, setProductId] = useState<number | null>(null)
  const [rows, setRows] = useState<IngredientOptionConfigRow[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  useEffect(() => {
    listProductsLiteAction().then((res) => {
      if (res.ok) {
        setProducts(res.data)
        if (res.data.length > 0) setProductId(res.data[0].id)
      }
      setLoadingProducts(false)
    })
  }, [])

  useEffect(() => {
    if (productId == null) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al cambiar de producto
    setLoadingRows(true)
    setFeedback(null)
    getIngredientOptionsAction(productId).then((res) => {
      if (cancelled) return
      if (res.ok) setRows(res.data)
      setLoadingRows(false)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  function updateRow(ingredientId: number, patch: Partial<IngredientOptionConfigRow>) {
    setRows((prev) => prev.map((r) => (r.ingredientId === ingredientId ? { ...r, ...patch } : r)))
  }

  async function handleSave() {
    if (productId == null || saving) return
    setSaving(true)
    setFeedback(null)
    const res = await saveIngredientOptionsAction(productId, rows)
    setSaving(false)
    setFeedback(
      res.ok
        ? { kind: "ok", message: "Configuración guardada." }
        : { kind: "error", message: res.error }
    )
  }

  if (loadingProducts) {
    return (
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-48 animate-pulse rounded bg-stone-100" />
      </section>
    )
  }

  if (products.length === 0) return null

  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold tracking-tight text-stone-900">
        Personalización de productos
      </h3>
      <p className="mt-1 text-xs text-stone-500">
        Elige un producto y marca qué insumos puede quitar el comensal (gratis) o agregar (con
        precio). Se ve en el menú QR y en el pedido que toma el mesero.
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-500">
          Producto
        </label>
        <select
          value={productId ?? ""}
          onChange={(e) => setProductId(Number(e.target.value))}
          className="w-full max-w-sm rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loadingRows ? (
        <div className="mt-4 space-y-2">
          <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
          <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center text-xs text-stone-500">
          Crea insumos en Inventario primero para poder configurarlos aquí.
        </p>
      ) : (
        <div className="mt-4 space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.ingredientId}
              className="flex flex-wrap items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5"
            >
              <span className="min-w-[120px] flex-1 text-xs font-bold text-stone-800">
                {r.name}
              </span>

              <div className="flex gap-1">
                {(
                  [
                    { value: null, label: "No aplica" },
                    { value: "removable" as const, label: "Removible" },
                    { value: "extra" as const, label: "Extra" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => updateRow(r.ingredientId, { kind: opt.value })}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                      r.kind === opt.value
                        ? "bg-orange-500 text-white"
                        : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {r.kind === "extra" && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-stone-500">
                    Precio
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={r.extraPrice}
                      onChange={(e) =>
                        updateRow(r.ingredientId, { extraPrice: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-800 outline-none focus:border-orange-300"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-stone-500">
                    Usa
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      inputMode="decimal"
                      value={r.quantity}
                      onChange={(e) =>
                        updateRow(r.ingredientId, { quantity: Math.max(0.01, Number(e.target.value) || 1) })
                      }
                      className="w-16 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-800 outline-none focus:border-orange-300"
                    />
                    {UNIT_LABEL[r.unit] ?? r.unit}
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {feedback && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || loadingRows || rows.length === 0}
        className="mt-4 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar configuración"}
      </button>
    </section>
  )
}
