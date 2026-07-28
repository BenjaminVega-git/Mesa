"use client"

import { useEffect, useMemo, useState } from "react"
import {
  getPosData,
  createPosOrder,
  getTableDiners,
  createTableDiner,
  type PosData,
  type PosDiner,
  type PosOrderResult,
} from "@/services/pos-service"
import { BuildPromoDialog } from "@/components/customer/BuildPromoDialog"
import { calcIngredientExtra } from "@/lib/ingredient-customization"
import type { MenuPromotion } from "@/types/menu"
import type { Product } from "@/types/product"
import type { CreateOrderItemInput } from "@/lib/validation/order"
import type { CartPromoSelection, CartIngredientChoice } from "@/types/cart-item"

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})
const fmt = (n: number) => clp.format(Math.round(n || 0))

type CartLine = {
  key: string
  productId?: number
  variantId?: number | null
  promotionId?: number
  selections?: CartPromoSelection[]
  ingredientChoices?: CartIngredientChoice[]
  name: string
  detail: string | null
  /** Precio unitario estimado para mostrar (el server SIEMPRE recalcula). */
  unitPrice: number
  quantity: number
  notes: string
}

function priceOf(product: Product, variantId: number | null): number {
  if (variantId != null) {
    const v = product.product_variants?.find((x) => x.id === variantId)
    if (v) return v.variant_price
  }
  return product.product_price
}

function fromPriceOf(product: Product): number {
  const vs = product.product_variants ?? []
  if (vs.length > 0) return Math.min(...vs.map((v) => v.variant_price))
  return product.product_price
}

/**
 * PANEL DE TOMA DE PEDIDOS (POS) del staff — overlay de pantalla completa.
 * Usa LA MISMA carta del menú QR (mismo payload cacheado) y crea el pedido
 * por el MISMO circuito del comensal (precios server-side, promos, stock),
 * así lo que ve el admin, el mesero y el comensal está siempre sincronizado.
 * El pedido entra al flujo normal: cocina → Cobrar.
 */
export function TakeOrderPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Pedido enviado (para toasts/refresh del padre). */
  onCreated?: (order: PosOrderResult) => void
}) {
  const [data, setData] = useState<PosData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tableId, setTableId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [lines, setLines] = useState<CartLine[]>([])
  // Modal de variante + personalización de ingredientes (uno solo, cubre
  // productos con variantes, con opciones de ingrediente, o ambos).
  const [customize, setCustomize] = useState<{
    product: Product
    variantId: number | null
    removed: Set<number>
    added: Set<number>
  } | null>(null)
  const [buildPromo, setBuildPromo] = useState<MenuPromotion | null>(null)
  // Comensal para el que es este pedido: null = "toda la mesa" (sin dividir).
  // Al asignarlo, el pedido entra a la división automática por comensal de
  // Cobrar → Dividir cuenta, igual que si el comensal pidiera por su QR.
  const [diners, setDiners] = useState<PosDiner[]>([])
  const [dinerSlot, setDinerSlot] = useState<number | null>(null)
  const [creatingDiner, setCreatingDiner] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PosOrderResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getPosData().then((res) => {
      if (cancelled) return
      if (res.ok) {
        setData(res.data)
        if (res.data.tables.length > 0) setTableId(res.data.tables[0].id)
      } else {
        setLoadError(res.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Al cambiar de mesa, traer sus comensales activos y limpiar la selección
  // (el número de comensal es propio de cada mesa).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al cambiar de mesa
    setDinerSlot(null)
    if (tableId == null) {
      setDiners([])
      return
    }
    let cancelled = false
    getTableDiners(tableId).then((res) => {
      if (!cancelled && res.ok) setDiners(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [tableId])

  async function handleNewDiner() {
    if (tableId == null || creatingDiner) return
    setCreatingDiner(true)
    const res = await createTableDiner(tableId)
    setCreatingDiner(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDiners((prev) => [...prev, res.data])
    setDinerSlot(res.data.slot)
  }

  const products = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.menu.products.filter((p) => {
      if (p.status_id !== 1) return false
      if (categoryId != null && p.category_id !== categoryId) return false
      if (q && !p.product_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [data, search, categoryId])

  const promotions = useMemo(() => {
    if (!data || categoryId != null) return []
    const q = search.trim().toLowerCase()
    return data.menu.promotions.filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [data, search, categoryId])

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [lines]
  )
  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines])

  function sameChoices(a?: CartIngredientChoice[], b?: CartIngredientChoice[]): boolean {
    const ka = (a ?? []).map((c) => `${c.ingredientId}:${c.action}`).sort().join(",")
    const kb = (b ?? []).map((c) => `${c.ingredientId}:${c.action}`).sort().join(",")
    return ka === kb
  }

  function addLine(line: Omit<CartLine, "key">) {
    setLines((prev) => {
      // Producto idéntico (misma variante, misma personalización, sin nota) → suma cantidad.
      if (line.productId != null) {
        const idx = prev.findIndex(
          (l) =>
            l.productId === line.productId &&
            (l.variantId ?? null) === (line.variantId ?? null) &&
            sameChoices(l.ingredientChoices, line.ingredientChoices) &&
            !l.notes
        )
        if (idx >= 0 && !prev[idx].promotionId) {
          const next = [...prev]
          next[idx] = { ...next[idx], quantity: Math.min(20, next[idx].quantity + line.quantity) }
          return next
        }
      }
      return [...prev, { ...line, key: `${Date.now()}-${prev.length}` }]
    })
  }

  function addProduct(p: Product) {
    const hasVariants = (p.product_variants ?? []).length > 0
    const hasIngredientOptions = (p.ingredient_options ?? []).length > 0
    if (hasVariants || hasIngredientOptions) {
      setCustomize({ product: p, variantId: null, removed: new Set(), added: new Set() })
      return
    }
    addLine({
      productId: p.id,
      variantId: null,
      name: p.product_name,
      detail: null,
      unitPrice: p.product_price,
      quantity: 1,
      notes: "",
    })
  }

  function confirmCustomize() {
    if (!customize) return
    const { product, variantId, removed, added } = customize
    const variant = product.product_variants?.find((v) => v.id === variantId)
    const basePrice = variant?.variant_price ?? product.product_price
    const choices: CartIngredientChoice[] = [
      ...Array.from(removed).map((id) => ({ ingredientId: id, action: "remove" as const })),
      ...Array.from(added).map((id) => ({ ingredientId: id, action: "add" as const })),
    ]
    const extra = calcIngredientExtra(choices, product.ingredient_options)
    const detailParts = [
      variant?.variant_name,
      ...Array.from(removed).map(
        (id) => `Sin ${product.ingredient_options?.find((o) => o.ingredient_id === id)?.name}`
      ),
      ...Array.from(added).map(
        (id) => `Extra ${product.ingredient_options?.find((o) => o.ingredient_id === id)?.name}`
      ),
    ].filter(Boolean)

    addLine({
      productId: product.id,
      variantId,
      ingredientChoices: choices.length > 0 ? choices : undefined,
      name: product.product_name,
      detail: detailParts.length > 0 ? detailParts.join(", ") : null,
      unitPrice: basePrice + extra,
      quantity: 1,
      notes: "",
    })
    setCustomize(null)
  }

  function addFixedPromo(promo: MenuPromotion) {
    addLine({
      promotionId: promo.id,
      name: promo.name,
      detail: promo.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ") || null,
      unitPrice: promo.promo_price,
      quantity: 1,
      notes: "",
    })
  }

  async function confirmBuildPromo(selections: CartPromoSelection[], quantity: number) {
    if (!buildPromo || !data) return
    const pct = buildPromo.discount_pct ?? 0
    const subtotal = selections.reduce((s, sel) => {
      const p = data.menu.products.find((x) => x.id === sel.productId)
      return s + (p ? priceOf(p, sel.variantId ?? null) : 0)
    }, 0)
    const unit = Math.round(subtotal * (1 - pct / 100))
    addLine({
      promotionId: buildPromo.id,
      selections,
      name: buildPromo.name,
      detail: `${selections.length} elecciones · ${pct}% OFF`,
      unitPrice: unit,
      quantity,
      notes: "",
    })
    setBuildPromo(null)
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function submit() {
    if (submitting || lines.length === 0 || tableId == null) return
    setSubmitting(true)
    setError(null)
    const items: CreateOrderItemInput[] = lines.map((l) => ({
      productId: l.productId ?? null,
      variantId: l.variantId ?? null,
      promotionId: l.promotionId ?? null,
      selections: l.selections ?? null,
      ingredientChoices: l.ingredientChoices ?? null,
      productQuantity: l.quantity,
      notes: l.notes.trim() || null,
    }))
    const res = await createPosOrder(tableId, items, dinerSlot)
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDone(res.data)
    setLines([])
    setCartOpen(false)
    onCreated?.(res.data)
  }

  const tableLabel = (id: number | null) => {
    const t = data?.tables.find((x) => x.id === id)
    return t ? `Mesa ${t.tableNumber ?? t.id}` : "—"
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#FAF9F5]">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-base font-extrabold tracking-tight text-stone-950 sm:text-lg">
            🧾 Tomar pedido
          </h2>
          {data && (
            <select
              value={tableId ?? ""}
              onChange={(e) => setTableId(Number(e.target.value))}
              className="max-w-[180px] rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-800 outline-none focus:border-orange-300"
            >
              {data.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Mesa {t.tableNumber ?? t.id}
                  {t.claimed ? " · ocupada" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-xs font-bold text-stone-600 shadow-sm transition hover:bg-stone-100"
        >
          Cerrar ✕
        </button>
      </header>

      {/* Carga / error de carga */}
      {!data && !loadError && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-orange-200 border-t-orange-500" />
        </div>
      )}
      {loadError && (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {loadError}
          </p>
        </div>
      )}

      {data && !done && (
        <div className="flex min-h-0 flex-1">
          {/* Carta */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-2.5 border-b border-stone-200/70 bg-white/60 px-4 py-3 sm:px-6">
              <input
                type="search"
                placeholder="Buscar en la carta…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              />
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setCategoryId(null)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    categoryId == null
                      ? "bg-stone-950 text-white"
                      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  Todo
                </button>
                {data.menu.categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      categoryId === c.id
                        ? "bg-stone-950 text-white"
                        : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {c.category_name}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-24 sm:px-6 lg:pb-4">
              {/* Promociones */}
              {promotions.length > 0 && (
                <section className="mb-5">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Promociones
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {promotions.map((promo) => (
                      <button
                        key={promo.id}
                        type="button"
                        onClick={() =>
                          promo.kind === "build" ? setBuildPromo(promo) : addFixedPromo(promo)
                        }
                        className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3 text-left shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
                      >
                        <p className="text-sm font-bold text-stone-900">🏷️ {promo.name}</p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-500">
                          {promo.kind === "build"
                            ? `${promo.discount_pct}% OFF eligiendo · desde ${fmt(promo.min_price ?? 0)}`
                            : promo.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                        </p>
                        <p className="mt-1 text-sm font-extrabold text-orange-700 tabular-nums">
                          {promo.kind === "build" ? "Armar →" : fmt(promo.promo_price)}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Productos */}
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-300 hover:shadow"
                  >
                    {p.product_image ? (
                      // Cloudinary ya sirve la imagen optimizada desde su CDN;
                      // next/image la rechazaría sin remotePatterns configurado
                      // (por eso el resto del proyecto usa <img> a propósito).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.product_image}
                        alt=""
                        loading="lazy"
                        className="h-11 w-11 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-lg">
                        🍽️
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-stone-900">
                        {p.product_name}
                      </span>
                      <span className="block text-xs font-extrabold text-orange-700 tabular-nums">
                        {(p.product_variants?.length ?? 0) > 0
                          ? `desde ${fmt(fromPriceOf(p))}`
                          : fmt(p.product_price)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-stone-950 px-2.5 py-1 text-[11px] font-bold text-white">
                      +
                    </span>
                  </button>
                ))}
                {products.length === 0 && (
                  <p className="col-span-full rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                    Sin resultados en la carta.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Pedido (columna en desktop / hoja inferior en móvil) */}
          <aside
            className={`${
              cartOpen ? "flex" : "hidden"
            } absolute inset-x-0 bottom-0 top-14 z-10 flex-col border-t border-stone-200 bg-white lg:static lg:flex lg:w-[340px] lg:border-l lg:border-t-0`}
          >
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <h3 className="text-sm font-extrabold text-stone-900">
                Pedido · {tableLabel(tableId)}
              </h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-full p-1 text-stone-400 hover:bg-stone-100 lg:hidden"
                aria-label="Ocultar pedido"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>

            {/* Para quién es el pedido: null = toda la mesa (sin dividir).
                Al asignar un comensal, el pedido entra solo a la división
                automática por comensal al cobrar. */}
            <div className="border-b border-stone-100 px-4 py-2.5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                Para quién es
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setDinerSlot(null)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                    dinerSlot == null
                      ? "bg-stone-950 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  Toda la mesa
                </button>
                {diners.map((d) => (
                  <button
                    key={d.slot}
                    type="button"
                    onClick={() => setDinerSlot(d.slot)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                      dinerSlot === d.slot
                        ? "bg-orange-500 text-white"
                        : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleNewDiner}
                  disabled={creatingDiner}
                  className="rounded-full bg-stone-50 px-3 py-1 text-[11px] font-bold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-100 disabled:opacity-50"
                >
                  {creatingDiner ? "…" : "+ Nuevo"}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {lines.length === 0 && (
                <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-3 py-6 text-center text-xs text-stone-500">
                  Toca productos de la carta para agregarlos.
                </p>
              )}
              {lines.map((l) => (
                <div key={l.key} className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-stone-900">{l.name}</p>
                      {l.detail && (
                        <p className="truncate text-[10px] text-stone-500">{l.detail}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="shrink-0 rounded-full p-1 text-stone-300 transition hover:bg-red-50 hover:text-red-500"
                      aria-label="Quitar"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          l.quantity <= 1
                            ? removeLine(l.key)
                            : updateLine(l.key, { quantity: l.quantity - 1 })
                        }
                        className="h-6 w-6 rounded-full bg-stone-100 text-xs font-extrabold text-stone-700 transition hover:bg-stone-200"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-xs font-extrabold tabular-nums">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateLine(l.key, { quantity: Math.min(20, l.quantity + 1) })}
                        className="h-6 w-6 rounded-full bg-stone-100 text-xs font-extrabold text-stone-700 transition hover:bg-stone-200"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs font-extrabold text-stone-900 tabular-nums">
                      {fmt(l.unitPrice * l.quantity)}
                    </p>
                  </div>
                  <input
                    type="text"
                    placeholder="Nota (sin cebolla, aparte…)"
                    value={l.notes}
                    maxLength={250}
                    onChange={(e) => updateLine(l.key, { notes: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-stone-100 bg-stone-50 px-2 py-1 text-[11px] text-stone-700 outline-none focus:border-orange-200"
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-stone-100 p-4">
              {error && (
                <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                  {error}
                </p>
              )}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Total estimado
                </span>
                <span className="text-lg font-extrabold text-stone-950 tabular-nums">{fmt(total)}</span>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || lines.length === 0 || tableId == null}
                className="w-full rounded-full bg-orange-500 px-4 py-3 text-sm font-extrabold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Enviando…"
                  : `Enviar pedido (${count} ítem${count === 1 ? "" : "s"})`}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Barra inferior móvil (abre el pedido) */}
      {data && !done && !cartOpen && lines.length > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-4 z-20 flex items-center justify-between rounded-full bg-stone-950 px-5 py-3.5 text-sm font-extrabold text-white shadow-2xl lg:hidden"
        >
          <span>
            Ver pedido ({count}) · {tableLabel(tableId)}
          </span>
          <span className="tabular-nums">{fmt(total)}</span>
        </button>
      )}

      {/* Pedido enviado */}
      {done && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h3 className="mt-3 text-base font-extrabold text-stone-950">Pedido enviado</h3>
            <p className="mt-1 text-xs text-stone-500">
              Pedido #{done.id} · Mesa {done.tableNumber ?? "—"}
              {done.dinerLabel ? ` · ${done.dinerLabel}` : ""} ·{" "}
              <strong className="tabular-nums">{fmt(done.total)}</strong>
            </p>
            <p className="mt-1 text-[11px] text-stone-400">
              Ya está en el panel de Pedidos; se cobra desde la sección Cobrar.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setDone(null)}
                className="rounded-full bg-stone-950 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-stone-800"
              >
                Tomar otro pedido
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-bold text-stone-600 transition hover:bg-stone-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variante + personalización de ingredientes (un solo modal) */}
      {customize && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h4 className="text-sm font-extrabold text-stone-950">{customize.product.product_name}</h4>

            {(customize.product.product_variants?.length ?? 0) > 0 && (
              <>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Elige una opción
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {customize.product.product_variants!.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setCustomize((c) => (c ? { ...c, variantId: v.id } : c))}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-left transition ${
                        customize.variantId === v.id
                          ? "border-orange-400 bg-orange-50"
                          : "border-stone-200 hover:border-orange-300 hover:bg-orange-50/50"
                      }`}
                    >
                      <span className="text-xs font-bold text-stone-800">{v.variant_name}</span>
                      <span className="text-xs font-extrabold text-orange-700 tabular-nums">
                        {fmt(v.variant_price)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {(customize.product.ingredient_options ?? []).length > 0 && (
              <>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Personalizar
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {customize.product.ingredient_options!.map((opt) => {
                    const isRemovable = opt.kind === "removable"
                    const checked = isRemovable
                      ? customize.removed.has(opt.ingredient_id)
                      : customize.added.has(opt.ingredient_id)
                    return (
                      <label
                        key={opt.ingredient_id}
                        className="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 px-4 py-2.5"
                      >
                        <span className="flex items-center gap-2 text-xs font-bold text-stone-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCustomize((c) => {
                                if (!c) return c
                                const set = new Set(isRemovable ? c.removed : c.added)
                                if (set.has(opt.ingredient_id)) set.delete(opt.ingredient_id)
                                else set.add(opt.ingredient_id)
                                return isRemovable ? { ...c, removed: set } : { ...c, added: set }
                              })
                            }
                            className="h-4 w-4 accent-orange-500"
                          />
                          {isRemovable ? `Sin ${opt.name}` : `Extra ${opt.name}`}
                        </span>
                        <span className="text-[11px] font-bold text-stone-500">
                          {isRemovable ? "gratis" : `+${fmt(opt.extra_price)}`}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCustomize(null)}
                className="flex-1 rounded-full border border-stone-300 px-4 py-2.5 text-xs font-bold text-stone-600 transition hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmCustomize}
                disabled={(customize.product.product_variants?.length ?? 0) > 0 && customize.variantId == null}
                className="flex-1 rounded-full bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Armar promo (mismo configurador que usa el comensal) */}
      {buildPromo && data && (
        <BuildPromoDialog
          promo={buildPromo}
          products={data.menu.products}
          onClose={() => setBuildPromo(null)}
          onConfirm={confirmBuildPromo}
        />
      )}
    </div>
  )
}
