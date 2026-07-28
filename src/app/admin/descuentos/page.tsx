"use client"

import { useCallback, useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { useRestaurantId } from "@/hooks/useRestaurantId"
import { useAllCategories } from "@/hooks/useAllCategories"
import { DiscountDialog } from "@/components/admin/DiscountDialog"
import { listSelectableProducts, type SelectableProduct } from "@/services/promotions-service"
import {
  listDiscounts,
  setDiscountActive,
  deleteDiscount,
  discountRuleSummary,
  type DiscountCode,
} from "@/services/discounts-service"

export default function DescuentosPage() {
  const { restaurantId } = useRestaurantId()
  const { categories } = useAllCategories()
  const [products, setProducts] = useState<SelectableProduct[]>([])
  const [coupons, setCoupons] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DiscountCode | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      setCoupons(await listDiscounts())
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los cupones.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    listDiscounts()
      .then((list) => {
        if (active) setCoupons(list)
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "No se pudieron cargar los cupones.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    listSelectableProducts(restaurantId)
      .then(setProducts)
      .catch(() => undefined)
  }, [restaurantId])

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(c: DiscountCode) {
    setEditing(c)
    setDialogOpen(true)
  }

  async function toggleActive(c: DiscountCode) {
    setBusyId(c.id)
    try {
      await setDiscountActive(c.id, !c.active)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(c: DiscountCode) {
    if (!confirm(`¿Eliminar el cupón "${c.code}"?`)) return
    setBusyId(c.id)
    try {
      await deleteDiscount(c.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Descuentos</h2>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-700 ring-1 ring-stone-200">
              {coupons.length}
            </span>
          </div>
          <p className="text-sm text-stone-600">
            Cupones con reglas (día, horario, alcance). El comensal ve solo los vigentes al momento de pedir.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/35 sm:self-auto"
        >
          + Nuevo cupón
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">{error}</p>
      )}

      {loading ? (
        <p className="rounded-3xl border border-stone-200 bg-white px-4 py-10 text-center text-sm font-semibold text-stone-500 shadow-sm">
          Cargando cupones…
        </p>
      ) : coupons.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-2xl">🎟️</span>
          <h3 className="mt-4 text-lg font-bold text-stone-900">Todavía no tenés cupones</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">
            Creá códigos de descuento con reglas de día, horario y alcance. Aparecen solos en el menú del
            comensal cuando corresponde.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            + Crear el primer cupón
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="divide-y divide-stone-100">
            {coupons.map((c) => (
              <div key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-stone-900 px-2.5 py-1 font-mono text-sm font-bold tracking-wide text-white">
                      {c.code}
                    </span>
                    {c.available_now ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/10">
                        Vigente ahora
                      </span>
                    ) : c.active ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        Fuera de horario
                      </span>
                    ) : (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">
                        Inactivo
                      </span>
                    )}
                    {c.usage_limit != null && (
                      <span className="text-xs text-stone-400">
                        {c.used_count}/{c.usage_limit} usos
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-stone-600">{discountRuleSummary(c)}</p>
                  {c.description && <p className="text-xs text-stone-400">{c.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(c)}
                    disabled={busyId === c.id}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                  >
                    {c.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    disabled={busyId === c.id}
                    aria-label="Eliminar"
                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dialogOpen && (
        <DiscountDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          categories={categories}
          products={products}
          initial={editing}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
