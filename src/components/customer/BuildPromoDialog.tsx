"use client"

import { useMemo, useState } from "react"
import type { MenuPromotion } from "@/types/menu"
import type { Product } from "@/types/product"
import type { CartPromoSelection } from "@/types/cart-item"

function formatPrice(price: number) {
  return `$${Math.round(price).toLocaleString("es-CL")}`
}

function promoDiscountLabel(promo: MenuPromotion) {
  return promo.discount_type === "amount"
    ? `${formatPrice(promo.discount_amount ?? 0)} OFF`
    : `${promo.discount_pct ?? 0}% OFF`
}

function calcPromoDiscount(promo: MenuPromotion, subtotal: number) {
  const raw =
    promo.discount_type === "amount"
      ? promo.discount_amount ?? 0
      : Math.round((subtotal * (promo.discount_pct ?? 0)) / 100)
  return Math.max(0, Math.min(Math.round(subtotal), Math.round(raw)))
}

type Sel = { productId: number; variantId: number | null }

/** Precio de un producto según la variante elegida (o la base si no tiene). */
function priceOf(product: Product, variantId: number | null): number {
  if (variantId != null) {
    const v = product.product_variants?.find((x) => x.id === variantId)
    if (v) return v.variant_price
  }
  return product.product_price
}

/** Precio "desde" de un producto en la lista (el menor entre sus variantes). */
function fromPriceOf(product: Product): number {
  const vs = product.product_variants ?? []
  if (vs.length > 0) return Math.min(...vs.map((v) => v.variant_price))
  return product.product_price
}

/**
 * Configurador de una promo armable: por cada grupo el comensal elige entre
 * min..max productos de una categoría. En promos mixtas también suma los
 * productos fijos. La base recalcula y valida el precio al agregar y al pedir.
 */
export function BuildPromoDialog({
  promo,
  products,
  onClose,
  onConfirm,
}: {
  promo: MenuPromotion
  products: Product[]
  onClose: () => void
  onConfirm: (selections: CartPromoSelection[], quantity: number) => Promise<void>
}) {
  const [byGroup, setByGroup] = useState<Record<number, Sel[]>>({})
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const fixedSubtotal = promo.kind === "mixed" ? promo.original_total : 0

  // Opciones disponibles por grupo: productos disponibles de su categoría.
  const optionsByGroup = useMemo(() => {
    const m = new Map<number, Product[]>()
    for (const g of promo.groups) {
      m.set(
        g.id,
        products.filter((p) => p.category_id === g.category_id && p.status_id === 1)
      )
    }
    return m
  }, [promo.groups, products])

  const productById = useMemo(() => {
    const m = new Map<number, Product>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  // Precio en vivo: suma de lo elegido menos el descuento configurado.
  const pricing = useMemo(() => {
    let subtotal = fixedSubtotal
    for (const g of promo.groups) {
      for (const s of byGroup[g.id] ?? []) {
        const p = productById.get(s.productId)
        if (p) subtotal += priceOf(p, s.variantId)
      }
    }
    const discount = calcPromoDiscount(promo, subtotal)
    return { subtotal, discount, total: Math.max(0, subtotal - discount) }
  }, [byGroup, promo, productById, fixedSubtotal])

  const complete = useMemo(
    () =>
      promo.groups.every((g) => {
        const n = (byGroup[g.id] ?? []).length
        return n >= g.min_select && n <= g.max_select
      }),
    [byGroup, promo.groups]
  )

  function isSelected(groupId: number, productId: number) {
    return (byGroup[groupId] ?? []).some((s) => s.productId === productId)
  }

  function toggle(groupId: number, product: Product, maxSelect: number) {
    setError("")
    setByGroup((prev) => {
      const cur = prev[groupId] ?? []
      const exists = cur.some((s) => s.productId === product.id)
      const defaultVariant = product.product_variants?.[0]?.id ?? null

      if (exists) {
        return { ...prev, [groupId]: cur.filter((s) => s.productId !== product.id) }
      }
      if (maxSelect === 1) {
        return { ...prev, [groupId]: [{ productId: product.id, variantId: defaultVariant }] }
      }
      if (cur.length >= maxSelect) return prev
      return { ...prev, [groupId]: [...cur, { productId: product.id, variantId: defaultVariant }] }
    })
  }

  function setVariant(groupId: number, productId: number, variantId: number) {
    setByGroup((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] ?? []).map((s) =>
        s.productId === productId ? { ...s, variantId } : s
      ),
    }))
  }

  async function handleConfirm() {
    setError("")
    for (const g of promo.groups) {
      const count = (byGroup[g.id] ?? []).length
      if (count < g.min_select || count > g.max_select) {
        setError(
          g.min_select === g.max_select
            ? `En "${g.name}" elegí ${g.min_select} opción${g.min_select === 1 ? "" : "es"}.`
            : `En "${g.name}" elegí entre ${g.min_select} y ${g.max_select} opciones.`
        )
        return
      }
    }

    const selections: CartPromoSelection[] = promo.groups.flatMap((g) =>
      (byGroup[g.id] ?? []).map((s) => ({
        groupId: g.id,
        productId: s.productId,
        variantId: s.variantId ?? null,
      }))
    )

    setSubmitting(true)
    try {
      await onConfirm(selections, quantity)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar el combo.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end sm:items-center sm:justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div className="relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#27272a] bg-[#0e0e10] sm:max-w-lg sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#1f1f23] p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[17px] font-black text-[#fafafa]">{promo.name}</h2>
              {(promo.discount_pct ?? promo.discount_amount ?? 0) > 0 && (
                <span className="shrink-0 rounded-full bg-[#fb923c] px-2 py-0.5 text-[11px] font-black text-[#1a1a1a]">
                  {promoDiscountLabel(promo)}
                </span>
              )}
            </div>
            {promo.description && (
              <p className="mt-0.5 line-clamp-2 text-[12px] text-[#a1a1aa]">{promo.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-full bg-[#18181b] p-1.5 text-[#a1a1aa] transition hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Grupos */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {promo.kind === "mixed" && promo.items.length > 0 && (
            <div>
              <h3 className="mb-2 text-[14px] font-bold text-[#fafafa]">Incluye fijo</h3>
              <div className="rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5">
                <p className="line-clamp-2 text-[12px] text-[#a1a1aa]">
                  {promo.items
                    .map((it) => `${it.quantity}x ${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ""}`)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-[12px] font-bold text-[#fb923c]">{formatPrice(fixedSubtotal)}</p>
              </div>
            </div>
          )}

          {promo.groups.map((g) => {
            const opts = optionsByGroup.get(g.id) ?? []
            const count = (byGroup[g.id] ?? []).length
            const hint =
              g.min_select === g.max_select
                ? `Elegí ${g.min_select}`
                : `Elegí ${g.min_select}–${g.max_select}`
            return (
              <div key={g.id}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[14px] font-bold text-[#fafafa]">{g.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      count >= g.min_select && count <= g.max_select
                        ? "bg-[#fb923c]/15 text-[#fb923c]"
                        : "bg-[#27272a] text-[#a1a1aa]"
                    }`}
                  >
                    {hint} · {count}/{g.max_select}
                  </span>
                </div>

                {opts.length === 0 ? (
                  <p className="rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5 text-[12px] text-[#a1a1aa]">
                    Sin opciones disponibles ahora.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {opts.map((p) => {
                      const selected = isSelected(g.id, p.id)
                      const sel = (byGroup[g.id] ?? []).find((s) => s.productId === p.id)
                      const hasVariants = (p.product_variants?.length ?? 0) > 0
                      const shownPrice = selected
                        ? priceOf(p, sel?.variantId ?? null)
                        : fromPriceOf(p)
                      return (
                        <div
                          key={p.id}
                          className={`rounded-xl border px-3 py-2.5 transition ${
                            selected ? "border-[#fb923c] bg-[#fb923c]/10" : "border-[#27272a] bg-[#18181b]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggle(g.id, p, g.max_select)}
                            className="flex w-full items-center gap-3 text-left"
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                                g.max_select === 1 ? "rounded-full" : "rounded-md"
                              } ${selected ? "border-[#fb923c] bg-[#fb923c]" : "border-[#3f3f46]"}`}
                            >
                              {selected && (
                                <svg className="h-3 w-3 text-[#1a1a1a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#fafafa]">
                              {p.product_name}
                            </span>
                            <span className="shrink-0 text-[13px] font-semibold text-[#a1a1aa]">
                              {!selected && hasVariants ? "desde " : ""}
                              {formatPrice(shownPrice)}
                            </span>
                          </button>

                          {selected && hasVariants && (
                            <select
                              value={sel?.variantId ?? p.product_variants![0].id}
                              onChange={(e) => setVariant(g.id, p.id, Number(e.target.value))}
                              className="mt-2 w-full rounded-lg border border-[#3f3f46] bg-[#0e0e10] px-2 py-1.5 text-[13px] text-[#fafafa]"
                            >
                              {p.product_variants!.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.variant_name} · {formatPrice(v.variant_price)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer: desglose + cantidad + agregar */}
        <div className="border-t border-[#1f1f23] p-4">
          {error && (
            <p className="mb-2.5 rounded-lg bg-red-500/15 px-3 py-2 text-[12px] font-semibold text-red-300">
              {error}
            </p>
          )}

          {/* Desglose en vivo */}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#a1a1aa]">Subtotal</span>
              <span className="text-[#d4d4d8]">{formatPrice(pricing.subtotal * quantity)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#a1a1aa]">Descuento {promoDiscountLabel(promo)}</span>
              <span className="font-semibold text-emerald-400">
                −{formatPrice(pricing.discount * quantity)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#1f1f23] pt-1.5 text-[15px]">
              <span className="font-bold text-[#fafafa]">Total</span>
              <span className="font-black text-[#fb923c]">
                {formatPrice(pricing.total * quantity)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-full bg-[#18181b] px-2 py-1.5">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#27272a] text-sm font-black text-[#fafafa]"
                aria-label="Menos"
              >
                −
              </button>
              <span className="min-w-[16px] text-center text-sm font-bold text-[#fafafa]">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#fb923c] text-sm font-black text-[#1a1a1a]"
                aria-label="Más"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-black transition active:scale-[0.98] disabled:opacity-60 ${
                complete ? "bg-[#fb923c] text-[#1a1a1a]" : "bg-[#27272a] text-[#a1a1aa]"
              }`}
            >
              {submitting
                ? "Agregando…"
                : complete
                  ? `Agregar combo · ${formatPrice(pricing.total * quantity)}`
                  : "Elegí las opciones"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
