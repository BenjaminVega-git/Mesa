"use client"

import { useCallback, useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { useRestaurantId } from "@/hooks/useRestaurantId"
import { useAllCategories } from "@/hooks/useAllCategories"
import { PromotionDialog } from "@/components/admin/PromotionDialog"
import {
  listPromotions,
  listSelectableProducts,
  setPromotionActive,
  deletePromotion,
  promoDiscountPct,
  type Promotion,
  type SelectableProduct,
} from "@/services/promotions-service"

function formatPrice(n: number) {
  return `$${Math.round(n).toLocaleString("es-CL")}`
}

function promoDiscountLabel(promo: Promotion, pct: number) {
  if (promo.kind === "fixed") return `${pct}% OFF`
  return promo.discount_type === "amount"
    ? `${formatPrice(promo.discount_amount ?? 0)} OFF`
    : `${promo.discount_pct ?? 0}% OFF`
}

export default function PromocionesPage() {
  const { restaurantId } = useRestaurantId()
  const { categories } = useAllCategories()
  const [promos, setPromos] = useState<Promotion[]>([])
  const [products, setProducts] = useState<SelectableProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await listPromotions()
      setPromos(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las promociones.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial (setState en callback async, no en el cuerpo del efecto).
  useEffect(() => {
    let active = true
    listPromotions()
      .then((list) => {
        if (active) setPromos(list)
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "No se pudieron cargar las promociones.")
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
  function openEdit(promo: Promotion) {
    setEditing(promo)
    setDialogOpen(true)
  }

  async function toggleActive(promo: Promotion) {
    setBusyId(promo.id)
    try {
      await setPromotionActive(promo.id, !promo.active)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(promo: Promotion) {
    if (!confirm(`¿Eliminar la promoción "${promo.name}"?`)) return
    setBusyId(promo.id)
    try {
      await deletePromotion(promo.id)
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
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Promociones</h2>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-700 ring-1 ring-stone-200">
              {promos.length}
            </span>
          </div>
          <p className="text-sm text-stone-600">
            Combos de tu carta a precio especial. Aparecen en el menú del comensal.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/35 sm:self-auto"
        >
          + Nueva promoción
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
          {error}
        </p>
      )}

      {loading ? (
        <p className="rounded-3xl border border-stone-200 bg-white px-4 py-10 text-center text-sm font-semibold text-stone-500 shadow-sm">
          Cargando promociones…
        </p>
      ) : promos.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-2xl">
            🏷️
          </span>
          <h3 className="mt-4 text-lg font-bold text-stone-900">Todavía no tenés promociones</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">
            Creá combos de productos de tu carta a un precio especial. El sistema calcula el
            descuento solo y los muestra en el menú.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            + Crear la primera promoción
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {promos.map((promo) => {
            const isConfigurable = promo.kind !== "fixed"
            const pct = isConfigurable
              ? (promo.discount_pct ?? 0)
              : promoDiscountPct(promo.original_total, promo.promo_price)
            const discountLabel = promoDiscountLabel(promo, pct)
            const fixedUnavailable = promo.items.some((it) => !it.available)
            const groupsUnavailable = promo.groups.some((g) => g.available_count < g.min_select)
            const someUnavailable = fixedUnavailable || groupsUnavailable
            return (
              <article
                key={promo.id}
                className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition ${
                  promo.active ? "border-stone-200" : "border-stone-200 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-base font-bold text-stone-900">{promo.name}</h3>
                      {isConfigurable && (
                        <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 ring-1 ring-orange-600/10">
                          {promo.kind === "mixed" ? "Mixta" : "Arma tu promo"}
                        </span>
                      )}
                    </div>
                    {promo.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{promo.description}</p>
                    )}
                  </div>
                  {(isConfigurable || pct > 0) && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/10">
                      {discountLabel}
                    </span>
                  )}
                </div>

                <ul className="mt-3 space-y-1">
                  {promo.items.map((it, i) => (
                    <li key={`item-${i}`} className="flex items-center gap-1.5 text-xs text-stone-600">
                      <span className="text-stone-400">{it.quantity}×</span>
                      <span className="truncate">
                        {it.product_name}
                        {it.variant_name ? ` · ${it.variant_name}` : ""}
                      </span>
                      {!it.available && (
                        <span className="rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700">
                          no disp.
                        </span>
                      )}
                    </li>
                  ))}
                  {promo.groups.map((g) => (
                        <li key={`group-${g.id}`} className="flex items-center gap-1.5 text-xs text-stone-600">
                          <span className="text-stone-400">
                            {g.min_select === g.max_select ? `${g.min_select}×` : `${g.min_select}-${g.max_select}×`}
                          </span>
                          <span className="truncate">{g.name}</span>
                          <span className="text-stone-400">·</span>
                          <span className="truncate text-stone-400">{g.category_name}</span>
                          {g.available_count < g.min_select && (
                            <span className="rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700">
                              sin stock
                            </span>
                          )}
                        </li>
                      ))}
                </ul>

                <div className="mt-3 flex items-end justify-between border-t border-stone-100 pt-3">
                  <div>
                    {isConfigurable ? (
                      <>
                        <span className="text-xs text-stone-400">
                          {promo.kind === "mixed" ? "Sobre fijos + elecciones" : "Sobre lo que elija"}
                        </span>
                        <p className="text-lg font-bold text-orange-600">{discountLabel}</p>
                      </>
                    ) : (
                      <>
                        {pct > 0 && (
                          <span className="text-xs text-stone-400 line-through">
                            {formatPrice(promo.original_total)}
                          </span>
                        )}
                        <p className="text-lg font-bold text-orange-600">
                          {formatPrice(promo.promo_price)}
                        </p>
                      </>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      promo.active
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10"
                        : "bg-stone-100 text-stone-500 ring-1 ring-stone-200"
                    }`}
                  >
                    {promo.active ? "Activa" : "Oculta"}
                  </span>
                </div>

                {someUnavailable && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                    {groupsUnavailable
                      ? "Un grupo no tiene suficientes productos disponibles; no se mostrará hasta reponerlos."
                      : "Tiene productos no disponibles; no se mostrará hasta reponerlos."}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(promo)}
                    className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(promo)}
                    disabled={busyId === promo.id}
                    className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                  >
                    {promo.active ? "Ocultar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(promo)}
                    disabled={busyId === promo.id}
                    aria-label="Eliminar"
                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {dialogOpen && (
        <PromotionDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          products={products}
          categories={categories}
          initial={editing}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
