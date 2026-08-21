"use client"

import { useMemo, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import {
  savePromotion,
  promoDiscountPct,
  type Promotion,
  type PromoDiscountType,
  type PromoKind,
  type SelectableProduct,
} from "@/services/promotions-service"
import type { Category } from "@/types/category"

function formatPrice(n: number) {
  return `$${Math.round(n).toLocaleString("es-CL")}`
}

function discountLabel(type: PromoDiscountType, pct: number, amount: number) {
  return type === "amount" ? `${formatPrice(amount || 0)}` : `${pct || 0}%`
}

function calcDiscount(subtotal: number, type: PromoDiscountType, pct: number, amount: number) {
  const raw = type === "amount" ? amount : Math.round((subtotal * pct) / 100)
  return Math.max(0, Math.min(Math.round(subtotal), Math.round(raw || 0)))
}

// ---- Combo fijo ----
type DraftItem = {
  key: string
  product_id: number
  variant_id: number | null
  product_name: string
  variant_name: string | null
  unit_price: number
  quantity: number
}

function itemKey(productId: number, variantId: number | null) {
  return `${productId}:${variantId ?? "base"}`
}

// ---- Arma tu promo (build): grupos de elección por categoría ----
type DraftGroup = {
  key: string
  name: string
  category_id: number | null
  option_product_ids: number[]
  min_select: number
  max_select: number
}

let groupKeySeq = 0
function newGroupKey() {
  groupKeySeq += 1
  return `g${groupKeySeq}`
}

export function PromotionDialog({
  open,
  onClose,
  products,
  categories,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  products: SelectableProduct[]
  categories: Category[]
  initial: Promotion | null
  onSaved: () => void
}) {
  const [kind, setKind] = useState<PromoKind>(initial?.kind ?? "fixed")
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [promoPrice, setPromoPrice] = useState<string>(
    initial && initial.kind === "fixed" ? String(initial.promo_price) : ""
  )
  const [discountPct, setDiscountPct] = useState<string>(
    initial?.discount_pct != null ? String(initial.discount_pct) : ""
  )
  const [discountType, setDiscountType] = useState<PromoDiscountType>(initial?.discount_type ?? "percent")
  const [discountAmount, setDiscountAmount] = useState<string>(
    initial?.discount_amount != null ? String(initial.discount_amount) : ""
  )
  const [active, setActive] = useState(initial?.active ?? true)
  const [items, setItems] = useState<DraftItem[]>(
    (initial?.items ?? []).map((it) => ({
      key: itemKey(it.product_id, it.variant_id),
      product_id: it.product_id,
      variant_id: it.variant_id,
      product_name: it.product_name,
      variant_name: it.variant_name,
      unit_price: it.unit_price,
      quantity: it.quantity,
    }))
  )
  const [groups, setGroups] = useState<DraftGroup[]>(
    (initial?.groups ?? []).map((g) => ({
      key: newGroupKey(),
      name: g.name,
      category_id: g.category_id,
      option_product_ids: g.option_product_ids ?? [],
      min_select: g.min_select,
      max_select: g.max_select,
    }))
  )
  const [search, setSearch] = useState("")
  const [variantChoice, setVariantChoice] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const originalTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0),
    [items]
  )
  const promoPriceNum = Number(promoPrice) || 0
  const discountPctNum = Number(discountPct) || 0
  const discountAmountNum = Number(discountAmount) || 0
  const fixedDiscountPct = promoDiscountPct(originalTotal, promoPriceNum)
  const hasFixedItems = kind === "fixed" || kind === "mixed"
  const hasChoiceGroups = kind === "build" || kind === "mixed"
  const usesDiscountPct = kind !== "fixed"

  // Cuántos productos tiene cada categoría (hint para armar los grupos).
  const countByCategory = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of products) {
      if (p.category_id != null) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1)
    }
    return m
  }, [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products.slice(0, 50)
    return products.filter((p) => p.product_name.toLowerCase().includes(q)).slice(0, 50)
  }, [products, search])

  // Ejemplo para el admin: cómo queda el combo eligiendo lo más económico de
  // cada grupo (mismo criterio que el "desde $X" que ve el comensal).
  const buildExample = useMemo(() => {
    if (!usesDiscountPct || groups.length === 0) return null
    let subtotal = kind === "mixed" ? originalTotal : 0
    for (const g of groups) {
      if (!g.category_id) continue
      const allowed = new Set(g.option_product_ids)
      const opts = products.filter((p) =>
        allowed.size > 0 ? allowed.has(p.id) : p.category_id === g.category_id
      )
      if (opts.length === 0) continue
      const cheapest = Math.min(
        ...opts.map((p) =>
          p.variants.length > 0
            ? Math.min(...p.variants.map((v) => v.variant_price))
            : p.product_price
        )
      )
      subtotal += cheapest * g.min_select
    }
    if (subtotal <= 0) return null
    const discount = calcDiscount(subtotal, discountType, discountPctNum, discountAmountNum)
    return { subtotal, discount, total: Math.max(0, subtotal - discount) }
  }, [kind, usesDiscountPct, groups, products, discountType, discountPctNum, discountAmountNum, originalTotal])

  function addItem(product: SelectableProduct, variantId: number | null) {
    const variant = variantId ? product.variants.find((v) => v.id === variantId) ?? null : null
    const unitPrice = variant ? variant.variant_price : product.product_price
    const key = itemKey(product.id, variantId)
    setItems((prev) => {
      const existing = prev.find((it) => it.key === key)
      if (existing) {
        return prev.map((it) =>
          it.key === key ? { ...it, quantity: Math.min(50, it.quantity + 1) } : it
        )
      }
      return [
        ...prev,
        {
          key,
          product_id: product.id,
          variant_id: variantId,
          product_name: product.product_name,
          variant_name: variant?.variant_name ?? null,
          unit_price: unitPrice,
          quantity: 1,
        },
      ]
    })
  }

  function setQty(key: string, qty: number) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, quantity: Math.max(1, Math.min(50, qty)) } : it))
    )
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  // ---- grupos (build) ----
  function addGroup() {
    setGroups((prev) => [
      ...prev,
      {
        key: newGroupKey(),
        name: "",
        category_id: categories[0]?.id ?? null,
        option_product_ids: [],
        min_select: 1,
        max_select: 1,
      },
    ])
  }
  function patchGroup(key: string, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)))
  }
  function removeGroup(key: string) {
    setGroups((prev) => prev.filter((g) => g.key !== key))
  }
  function toggleGroupProduct(key: string, productId: number) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== key) return g
        const current = new Set(g.option_product_ids)
        if (current.has(productId)) current.delete(productId)
        else current.add(productId)
        return { ...g, option_product_ids: Array.from(current) }
      })
    )
  }

  async function handleSave() {
    setError("")
    if (!name.trim()) return setError("Ponele un nombre a la promoción.")

    if (kind === "fixed") {
      if (promoPriceNum <= 0) return setError("Ingresá el precio de la promoción.")
      if (items.length === 0) return setError("Agregá al menos un producto.")
      if (promoPriceNum > originalTotal) {
        return setError("El precio de promoción no puede superar el precio original.")
      }
    } else {
      if (discountType === "percent" && (discountPctNum < 1 || discountPctNum > 100)) {
        return setError("Ingresá un descuento entre 1% y 100%.")
      }
      if (discountType === "amount" && discountAmountNum <= 0) {
        return setError("Ingresá un monto fijo de descuento mayor a $0.")
      }
      if (kind === "mixed" && items.length === 0) {
        return setError("Agregá al menos un producto fijo para la promo mixta.")
      }
      if (groups.length === 0) return setError("Agregá al menos un grupo de elección.")
      for (const g of groups) {
        if (!g.category_id) return setError("Cada grupo necesita una categoría.")
        if (g.max_select < 1 || g.min_select < 0 || g.max_select < g.min_select) {
          return setError("Revisá el mínimo/máximo de un grupo.")
        }
        if (g.option_product_ids.length > 0 && g.option_product_ids.length < g.min_select) {
          return setError("Un grupo con productos específicos necesita suficientes opciones para el mínimo.")
        }
      }
    }

    setSaving(true)
    try {
      await savePromotion({
        id: initial?.id ?? null,
        kind,
        name: name.trim(),
        description: description.trim() || null,
        promo_price: kind === "fixed" ? promoPriceNum : 0,
        discount_type: usesDiscountPct ? discountType : "percent",
        discount_pct: usesDiscountPct && discountType === "percent" ? discountPctNum : null,
        discount_amount: usesDiscountPct && discountType === "amount" ? discountAmountNum : null,
        image_url: initial?.image_url ?? null,
        active,
        items:
          hasFixedItems
            ? items.map((it) => ({
                product_id: it.product_id,
                variant_id: it.variant_id,
                quantity: it.quantity,
              }))
            : [],
        groups:
          hasChoiceGroups
            ? groups.map((g, i) => ({
                category_id: g.category_id as number,
                name: g.name.trim(),
                option_product_ids: g.option_product_ids,
                min_select: g.min_select,
                max_select: g.max_select,
                sort_order: i,
              }))
            : [],
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la promoción.")
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
  const labelCls = "mb-1.5 block text-xs font-semibold text-stone-700"

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={initial ? "Editar promoción" : "Nueva promoción"}
      description="Combo fijo, arma tu promo o una mezcla con productos obligatorios y elecciones."
      locked={saving}
    >
      <div className="space-y-5">
        {/* Selector de tipo */}
        <div>
          <label className={labelCls}>Tipo de promoción</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { k: "fixed", t: "Combo fijo", d: "Productos definidos, precio fijo" },
              { k: "build", t: "Arma tu promo", d: "El comensal elige por categoría" },
              { k: "mixed", t: "Mixta", d: "Fijos + elecciones con descuento" },
            ] as const).map((opt) => (
              <button
                key={opt.k}
                type="button"
                onClick={() => setKind(opt.k)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  kind === opt.k
                    ? "border-orange-300 bg-orange-50 ring-2 ring-orange-100"
                    : "border-stone-200 bg-white hover:bg-stone-50"
                }`}
              >
                <p className="text-sm font-bold text-stone-800">{opt.t}</p>
                <p className="text-[11px] text-stone-500">{opt.d}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Nombre</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={usesDiscountPct ? "Ej. Arma tu combo" : "Ej. Promo Once para 2"}
              maxLength={120}
            />
          </div>
          <div>
            <label className={labelCls}>Descripción (opcional)</label>
            <input
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Elegí hamburguesa + bebida + acompañamiento"
              maxLength={200}
            />
          </div>
        </div>

        {hasFixedItems && (
          <>
            {/* Selector de productos fijos */}
            <div>
              <label className={labelCls}>
                {kind === "mixed" ? "Productos fijos incluidos" : "Agregar productos de tu carta"}
              </label>
              <input
                className={inputCls}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto…"
              />
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-stone-200 bg-white">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-stone-400">Sin resultados.</p>
                ) : (
                  filtered.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 border-b border-stone-100 px-3 py-2 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-800">{p.product_name}</p>
                        <p className="text-xs text-stone-500">
                          {p.variants.length > 0 ? "Con variantes" : formatPrice(p.product_price)}
                        </p>
                      </div>
                      {p.variants.length > 0 && (
                        <select
                          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs"
                          value={variantChoice[p.id] ?? p.variants[0].id}
                          onChange={(e) =>
                            setVariantChoice((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))
                          }
                        >
                          {p.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.variant_name} · {formatPrice(v.variant_price)}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          addItem(p, p.variants.length > 0 ? variantChoice[p.id] ?? p.variants[0].id : null)
                        }
                        className="shrink-0 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-orange-600"
                      >
                        + Agregar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {items.length > 0 && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <p className="mb-2 text-xs font-semibold text-stone-700">Incluye</p>
                <div className="space-y-2">
                  {items.map((it) => (
                    <div key={it.key} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-stone-800">
                          {it.product_name}
                          {it.variant_name ? <span className="text-stone-500"> · {it.variant_name}</span> : null}
                        </p>
                        <p className="text-xs text-stone-500">{formatPrice(it.unit_price)} c/u</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={it.quantity}
                        onChange={(e) => setQty(it.key, Number(e.target.value))}
                        className="w-16 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(it.key)}
                        aria-label="Quitar"
                        className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {hasChoiceGroups && (
          <>
            {/* Grupos de elección (arma tu promo) */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className={labelCls + " mb-0"}>Grupos de elección</label>
                <button
                  type="button"
                  onClick={addGroup}
                  disabled={categories.length === 0}
                  className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
                >
                  + Agregar grupo
                </button>
              </div>
              {categories.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-4 text-center text-xs text-stone-500">
                  Primero creá categorías con productos en tu carta.
                </p>
              ) : groups.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-4 text-center text-xs text-stone-500">
                  Agregá grupos como “Elegí tu hamburguesa”, “Elegí tu bebida”…
                </p>
              ) : (
                <div className="space-y-2.5">
                  {groups.map((g, idx) => {
                    const isSpecific = g.option_product_ids.length > 0
                    const count = isSpecific
                      ? g.option_product_ids.length
                      : g.category_id
                        ? countByCategory.get(g.category_id) ?? 0
                        : 0
                    const categoryProducts = g.category_id
                      ? products.filter((p) => p.category_id === g.category_id)
                      : products
                    return (
                      <div key={g.key} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-stone-500">Grupo {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeGroup(g.key)}
                            aria-label="Quitar grupo"
                            className="rounded-lg p-1 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input
                            className={inputCls}
                            value={g.name}
                            onChange={(e) => patchGroup(g.key, { name: e.target.value })}
                            placeholder="Nombre (ej. Tu bebida)"
                            maxLength={80}
                          />
                          <select
                            className={inputCls}
                            value={g.category_id ?? ""}
                            onChange={(e) => patchGroup(g.key, { category_id: Number(e.target.value), option_product_ids: [] })}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.category_name} ({countByCategory.get(c.id) ?? 0})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-2">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-stone-500">
                              Opciones del grupo
                            </span>
                            <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
                              <button
                                type="button"
                                onClick={() => patchGroup(g.key, { option_product_ids: [] })}
                                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                                  !isSpecific ? "bg-white text-orange-700 shadow-sm" : "text-stone-500"
                                }`}
                              >
                                Categoría
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  patchGroup(g.key, {
                                    option_product_ids:
                                      g.option_product_ids.length > 0
                                        ? g.option_product_ids
                                        : categoryProducts.slice(0, Math.max(1, g.min_select)).map((p) => p.id),
                                  })
                                }
                                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                                  isSpecific ? "bg-white text-orange-700 shadow-sm" : "text-stone-500"
                                }`}
                              >
                                Productos
                              </button>
                            </div>
                          </div>
                          {isSpecific ? (
                            <div className="grid max-h-36 gap-1 overflow-y-auto sm:grid-cols-2">
                              {categoryProducts.length === 0 ? (
                                <p className="col-span-full py-2 text-center text-xs text-stone-400">
                                  Sin productos en esta categoría.
                                </p>
                              ) : (
                                categoryProducts.map((p) => (
                                  <label
                                    key={p.id}
                                    className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={g.option_product_ids.includes(p.id)}
                                      onChange={() => toggleGroupProduct(g.key, p.id)}
                                      className="h-3.5 w-3.5 rounded border-stone-300 text-orange-500 focus:ring-orange-200"
                                    />
                                    <span className="truncate">{p.product_name}</span>
                                  </label>
                                ))
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-stone-500">
                              Se mostrarán todos los productos disponibles de la categoría elegida.
                            </p>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-stone-600">
                            Elige mín
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={g.min_select}
                              onChange={(e) =>
                                patchGroup(g.key, { min_select: Math.max(0, Number(e.target.value)) })
                              }
                              className="w-14 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-stone-600">
                            máx
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={g.max_select}
                              onChange={(e) =>
                                patchGroup(g.key, { max_select: Math.max(1, Number(e.target.value)) })
                              }
                              className="w-14 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm"
                            />
                          </label>
                          <span className="text-[11px] text-stone-400">
                            {count} producto{count === 1 ? "" : "s"} en la categoría
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Precio fijo o descuento */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              {usesDiscountPct ? "Descuento sobre el combo" : "Precio de la promoción"}
            </label>
            {usesDiscountPct ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
                  {([
                    { value: "percent", label: "%" },
                    { value: "amount", label: "$ fijo" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDiscountType(opt.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        discountType === opt.value
                          ? "bg-white text-orange-700 shadow-sm ring-1 ring-orange-200"
                          : "text-stone-500 hover:bg-white/60"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {discountType === "percent" ? (
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className={inputCls + " pr-8"}
                      value={discountPct}
                      onChange={(e) => setDiscountPct(e.target.value)}
                      placeholder="Ej. 20"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-bold text-stone-400">
                      %
                    </span>
                  </div>
                ) : (
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    placeholder="Ej. 3000"
                  />
                )}
              </div>
            ) : (
              <input
                type="number"
                min={0}
                className={inputCls}
                value={promoPrice}
                onChange={(e) => setPromoPrice(e.target.value)}
                placeholder="0"
              />
            )}
          </div>

          {!usesDiscountPct ? (
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Precio original</span>
                <span className="font-semibold text-stone-700">{formatPrice(originalTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-stone-500">Descuento</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    fixedDiscountPct > 0
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10"
                      : "text-stone-400"
                  }`}
                >
                  {fixedDiscountPct}% OFF
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-stone-500">Se vende a</span>
                <span className="font-bold text-orange-600">{formatPrice(promoPriceNum)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xs text-stone-500">
                El comensal paga la suma de {kind === "mixed" ? "lo fijo y lo que elija" : "lo que elija"}, menos{" "}
                <span className="font-bold text-orange-600">
                  {discountLabel(discountType, discountPctNum, discountAmountNum)}
                </span>.
              </p>
              {kind === "mixed" && originalTotal > 0 && (
                <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                  <span className="text-stone-500">Productos fijos</span>
                  <span className="font-semibold text-stone-700">{formatPrice(originalTotal)}</span>
                </div>
              )}
              {buildExample ? (
                <div className={kind === "mixed" && originalTotal > 0 ? "mt-2" : "mt-2 border-t border-stone-100 pt-2"}>
                  <p className="mb-1 text-[10px] font-bold tracking-wide text-stone-400 uppercase">
                    {kind === "mixed" ? "Ejemplo total (opción más económica)" : "Ejemplo (opción más económica)"}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">Suma de productos</span>
                    <span className="text-stone-600">{formatPrice(buildExample.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">
                      Descuento {discountLabel(discountType, discountPctNum, discountAmountNum)}
                    </span>
                    <span className="text-emerald-600">−{formatPrice(buildExample.discount)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-stone-700">Queda en</span>
                    <span className="font-bold text-orange-600">{formatPrice(buildExample.total)}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-stone-400">
                  Agregá grupos con categorías que tengan productos para ver un ejemplo.
                </p>
              )}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-orange-500 focus:ring-orange-200"
          />
          Mostrar esta promoción en el menú
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/35 disabled:opacity-50"
          >
            {saving ? "Guardando…" : initial ? "Guardar cambios" : "Crear promoción"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
