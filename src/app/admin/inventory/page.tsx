"use client"

import { useState } from "react"
import { useInventory } from "@/hooks/useInventory"
import { IngredientFormDialog } from "@/components/admin/IngredientFormDialog"
import { StockActionDialog } from "@/components/admin/StockActionDialog"
import { StockHistoryDialog } from "@/components/admin/StockHistoryDialog"
import { ImportInventoryDialog } from "@/components/admin/ImportInventoryDialog"
import { InventoryAlertsPanel } from "@/components/admin/InventoryAlertsPanel"
import { StockModeSelector } from "@/components/admin/StockModeSelector"
import { IngredientCustomizationSection } from "@/components/admin/IngredientCustomizationSection"
import { formatStock, formatUnitPrice } from "@/lib/inventory/units"
import type { IngredientWithFlag } from "@/types/ingredient"

export default function InventoryPage() {
  const {
    ingredients,
    loading,
    error,
    lowStockCount,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    restockIngredient,
    setStock,
    refresh,
  } = useInventory()

  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editing, setEditing] = useState<IngredientWithFlag | null>(null)
  const [stockAction, setStockAction] = useState<{
    mode: "restock" | "adjust"
    ingredient: IngredientWithFlag
  } | null>(null)
  const [history, setHistory] = useState<IngredientWithFlag | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function handleDelete(ing: IngredientWithFlag) {
    const confirmed = window.confirm(
      `¿Eliminar "${ing.name}"? Se borrarán su receta y su historial de movimientos.`
    )
    if (!confirmed) return
    setDeletingId(ing.id)
    await deleteIngredient(ing.id)
    setDeletingId(null)
  }

  // Reponer desde una alerta de stock: abre el diálogo con el insumo cargado.
  function handleRestockAlert(id: number) {
    const ing = ingredients.find((i) => i.id === id)
    if (ing) setStockAction({ mode: "restock", ingredient: ing })
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">Inventario</h2>
          <p className="mt-1 max-w-prose text-sm text-stone-600">
            Controla los insumos de tu cocina. El stock se descuenta solo con cada venta de
            productos que tengan receta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
          >
            Importar CSV
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-orange-600"
          >
            + Nuevo insumo
          </button>
        </div>
      </div>

      {/* MODO DE DISPONIBILIDAD POR STOCK (global) */}
      <StockModeSelector />

      {/* STATS */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Insumos</p>
          <p className="mt-0.5 text-2xl font-extrabold leading-none tracking-tight text-stone-900">
            {loading ? "…" : ingredients.length}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            lowStockCount > 0 ? "border-red-200 bg-red-50" : "border-stone-200 bg-white"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">En quiebre</p>
          <p
            className={`mt-0.5 text-2xl font-extrabold leading-none tracking-tight ${
              lowStockCount > 0 ? "text-red-700" : "text-stone-900"
            }`}
          >
            {loading ? "…" : lowStockCount}
          </p>
        </div>
      </div>

      {/* ALERTAS DE STOCK (sin stock / bajo mínimo), en vivo */}
      <InventoryAlertsPanel onRestock={handleRestockAlert} />

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* LISTA */}
      <div className="mt-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-stone-500">Cargando inventario...</p>
        ) : ingredients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
            <p className="text-sm font-semibold text-stone-700">Aún no tienes insumos</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-stone-500">
              Crea tus insumos (pan, carne, bebidas...) y luego asígnalos como receta a cada
              producto desde la pestaña “Receta”.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600"
            >
              + Crear primer insumo
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {ingredients.map((ing) => (
              <li
                key={ing.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-stone-900">{ing.name}</p>
                    {ing.low && (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/10">
                        Quiebre
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Stock:{" "}
                    <span className={`font-bold ${ing.low ? "text-red-700" : "text-stone-800"}`}>
                      {formatStock(ing.stock_actual, ing.unit)}
                    </span>
                    <span className="text-stone-400">
                      {" · "}mín {formatStock(ing.stock_minimo, ing.unit)}
                    </span>
                    {ing.precio > 0 && (
                      <span className="text-stone-400">
                        {" · "}
                        {formatUnitPrice(ing.precio, ing.unit)}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStockAction({ mode: "restock", ingredient: ing })}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Reponer
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockAction({ mode: "adjust", ingredient: ing })}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 transition hover:bg-stone-100"
                  >
                    Ajustar
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistory(ing)}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 transition hover:bg-stone-100"
                  >
                    Historial
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(ing)}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 transition hover:bg-stone-100"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === ing.id}
                    onClick={() => handleDelete(ing)}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingId === ing.id ? "..." : "Eliminar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <IngredientCustomizationSection />

      {/* DIALOGS */}
      <IngredientFormDialog
        open={showCreate}
        mode="create"
        onClose={() => setShowCreate(false)}
        onCreate={createIngredient}
        onUpdate={updateIngredient}
      />
      <IngredientFormDialog
        open={editing !== null}
        mode="edit"
        ingredient={editing}
        onClose={() => setEditing(null)}
        onCreate={createIngredient}
        onUpdate={updateIngredient}
      />
      <StockActionDialog
        open={stockAction !== null}
        mode={stockAction?.mode ?? "restock"}
        ingredient={stockAction?.ingredient ?? null}
        onClose={() => setStockAction(null)}
        onRestock={restockIngredient}
        onSetStock={setStock}
      />
      <StockHistoryDialog
        open={history !== null}
        ingredient={history}
        onClose={() => setHistory(null)}
      />
      <ImportInventoryDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={refresh}
      />
    </div>
  )
}
