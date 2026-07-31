"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTableCart } from "@/hooks/useTableCart"
import { ProductImage } from "@/components/customer/ProductImage"
import { flyToCart } from "@/lib/customer/fly-to-cart"
import { calcIngredientExtra } from "@/lib/ingredient-customization"
import type { Product } from "@/types/product"
import type { CartIngredientChoice, CartMenuOptionChoice } from "@/types/cart-item"

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

type ProductDetailSheetProps = {
  product: Product
  tableId: number | null
  restaurantId: number | null
  onClose: () => void
  onAdded?: (name: string) => void
}

/**
 * Detalle de producto como bottom-sheet: entra deslizándose de abajo hacia
 * arriba sobre el menú, así el carrito flotante del menú sigue accesible.
 * Usa los datos ya cargados del menú (no hace fetch). La RPC de pedido valida
 * disponibilidad/precio server-side al confirmar.
 */
export function ProductDetailSheet({
  product,
  tableId,
  restaurantId,
  onClose,
  onAdded,
}: ProductDetailSheetProps) {
  const { addItem } = useTableCart(tableId, restaurantId)
  const variants = product.product_variants ?? []
  const [activeVariantIndex, setActiveVariantIndex] = useState(0)
  const [qty, setQty] = useState(1)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [closing, setClosing] = useState(false)
  const [checking, setChecking] = useState(false)
  // Agotado detectado por el chequeo en vivo al intentar agregar (cubre el caso
  // de menú cacheado que no reflejó la última venta).
  const [soldOut, setSoldOut] = useState(false)

  const touchStartX = useRef<number | null>(null)

  const activeVariant = variants[Math.min(activeVariantIndex, variants.length - 1)] ?? null
  const basePrice = activeVariant?.variant_price ?? product.product_price
  const activeImage = activeVariant?.variant_image ?? product.product_image

  // Personalización: quitar ingredientes incluidos (gratis) o agregar extras
  // con precio fijo. Configurado en Inventario; vacío si el admin no lo usa.
  const removableOptions = (product.ingredient_options ?? []).filter((o) => o.kind === "removable")
  const extraOptions = (product.ingredient_options ?? []).filter((o) => o.kind === "extra")
  const menuOptions = product.menu_options ?? []
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [selectedMenuOptions, setSelectedMenuOptions] = useState<Set<number>>(new Set())

  const ingredientChoices = useMemo<CartIngredientChoice[]>(() => {
    const choices: CartIngredientChoice[] = []
    removed.forEach((id) => choices.push({ ingredientId: id, action: "remove" }))
    added.forEach((id) => choices.push({ ingredientId: id, action: "add" }))
    return choices
  }, [removed, added])

  const extraTotal = calcIngredientExtra(ingredientChoices, product.ingredient_options)
  const menuOptionsTotal = menuOptions.reduce(
    (sum, option) => sum + (selectedMenuOptions.has(option.id) ? option.extra_price : 0),
    0
  )
  const activePrice = basePrice + extraTotal + menuOptionsTotal

  function toggleRemoved(id: number) {
    setRemoved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAdded(id: number) {
    setAdded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleMenuOption(id: number) {
    setSelectedMenuOptions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // Agotado = toggle manual (status_id 2) o sin stock por receta. Con variantes,
  // se evalúa la variante seleccionada; si no, el producto.
  const stockOut = activeVariant ? !!activeVariant.stock_out : !!product.stock_out
  const isAgotado = product.status_id === 2 || stockOut || soldOut

  // Al cambiar de variante, limpiar el "agotado" detectado en vivo (era de la
  // variante anterior).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al cambiar de variante
    setSoldOut(false)
  }, [activeVariantIndex])

  // Deslizar sobre la imagen para cambiar de variante (además de los chips).
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current
    touchStartX.current = null
    if (start === null || variants.length < 2) return
    const dx = (e.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(dx) < 40) return
    setActiveVariantIndex((i) =>
      dx < 0 ? Math.min(i + 1, variants.length - 1) : Math.max(i - 1, 0)
    )
  }

  // Cierre con animación de salida: dispara el slide-down + fade-out y recién
  // entonces desmonta (onClose) cuando termina.
  function requestClose() {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 260)
  }

  async function handleAdd() {
    if (isAgotado || checking || !tableId || !restaurantId) return
    setChecking(true)
    try {
      // Chequeo en vivo: el menú puede estar cacheado y no reflejar la última
      // venta. Si ya no hay stock, bloqueamos acá (sin revelar qué insumo falta).
      const params = new URLSearchParams({ id: String(product.id) })
      if (activeVariant) params.set("variant_id", String(activeVariant.id))
      const res = await fetch(`/api/product-status?${params.toString()}`)
      const data = await res.json().catch(() => null)

      const unavailable =
        !data ||
        data.status_id !== 1 ||
        (activeVariant ? !!data.variant_stock_out : !!data.stock_out)

      if (unavailable) {
        setSoldOut(true)
        return
      }

      flyToCart(imgRef.current)
      addItem({
        productId: product.id,
        variantId: activeVariant?.id ?? null,
        price: activePrice,
        quantity: qty,
        ingredientChoices: ingredientChoices.length > 0 ? ingredientChoices : null,
        menuOptionChoices:
          selectedMenuOptions.size > 0
            ? Array.from(selectedMenuOptions).map<CartMenuOptionChoice>((optionId) => ({ optionId }))
            : null,
      })
      onAdded?.(product.product_name)
      requestClose()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-md ${
        closing ? "animate-overlay-fade-out" : "animate-overlay-fade"
      }`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
    >
      <section
        className={`flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[28px] bg-[#0f0f10] text-[#fafafa] shadow-2xl shadow-black/50 sm:mb-4 sm:rounded-[28px] ${
          closing ? "animate-sheet-down" : "animate-sheet-up"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative h-[280px] shrink-0 overflow-hidden bg-[#0f0f10]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div key={activeVariantIndex} className="absolute inset-0 animate-image-swap">
            <ProductImage
              src={activeImage}
              alt={activeVariant?.variant_name ?? product.product_name}
              className="h-full w-full"
              imgRef={imgRef}
              hasBackground={!product.image_recortada}
              fade="bottom"
            />
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-2xl font-light text-white backdrop-blur"
            aria-label="Volver"
          >
            ‹
          </button>
          {variants.length > 1 ? (
            <div className="absolute inset-x-0 bottom-3 z-[3] flex justify-center gap-1.5">
              {variants.map((variant, index) => (
                <span
                  key={variant.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === activeVariantIndex ? "w-5 bg-[#fb923c]" : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="mt-4 flex items-start justify-between gap-3">
            <h2 className="font-[family-name:var(--font-grotesk)] text-[24px] font-bold leading-[1.1] tracking-[-0.03em] text-[#fafafa]">
              {product.product_name}
            </h2>
            <span className="shrink-0 pt-1 font-[family-name:var(--font-grotesk)] text-[20px] font-extrabold text-[#fafafa]">
              {formatPrice(activePrice)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#27272a] bg-[#18181b] px-3 py-1 text-[11px] font-bold text-[#d4d4d8]">
              {product.categories?.category_name ?? "Producto"}
            </span>
            {isAgotado ? (
              <span className="rounded-full bg-[#dc2626] px-3 py-1 text-[11px] font-bold text-white">
                Agotado
              </span>
            ) : null}
          </div>

          {product.product_description ? (
            <p className="mt-4 text-[14px] leading-6 text-[#d4d4d8]">{product.product_description}</p>
          ) : null}

          {variants.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#71717a]">
                Elige una opcion
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                {variants.map((variant, index) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setActiveVariantIndex(index)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                      index === activeVariantIndex
                        ? "bg-[#fb923c] text-[#1a1a1a]"
                        : "border border-[#27272a] bg-[#18181b] text-[#d4d4d8]"
                    }`}
                  >
                    {variant.variant_name}
                  </button>
                ))}
              </div>
              {activeVariant?.variant_description ? (
                <p className="mt-2 text-[12px] leading-5 text-[#a1a1aa]">
                  {activeVariant.variant_description}
                </p>
              ) : null}
            </div>
          ) : null}

          {(removableOptions.length > 0 || extraOptions.length > 0) && (
            <div className="mt-5">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#71717a]">
                Personaliza tu pedido
              </p>
              <div className="space-y-1.5">
                {removableOptions.map((opt) => (
                  <label
                    key={`rm-${opt.ingredient_id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-[#e4e4e7]">
                      <input
                        type="checkbox"
                        checked={removed.has(opt.ingredient_id)}
                        onChange={() => toggleRemoved(opt.ingredient_id)}
                        className="h-4 w-4 rounded border-[#3f3f46] accent-[#fb923c]"
                      />
                      Sin {opt.name}
                    </span>
                    <span className="text-[11px] text-[#71717a]">gratis</span>
                  </label>
                ))}
                {extraOptions.map((opt) => (
                  <label
                    key={`ex-${opt.ingredient_id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-[#e4e4e7]">
                      <input
                        type="checkbox"
                        checked={added.has(opt.ingredient_id)}
                        onChange={() => toggleAdded(opt.ingredient_id)}
                        className="h-4 w-4 rounded border-[#3f3f46] accent-[#fb923c]"
                      />
                      Extra {opt.name}
                    </span>
                    <span className="text-[11px] font-bold text-[#fb923c]">
                      +{formatPrice(opt.extra_price)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {menuOptions.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#71717a]">
                Opciones adicionales
              </p>
              <div className="space-y-1.5">
                {menuOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#27272a] bg-[#18181b] px-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[#e4e4e7]">
                      <input
                        type="checkbox"
                        checked={selectedMenuOptions.has(option.id)}
                        onChange={() => toggleMenuOption(option.id)}
                        className="h-4 w-4 rounded border-[#3f3f46] accent-[#fb923c]"
                      />
                      <span className="truncate">{option.name}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-[#fb923c]">
                      {option.extra_price > 0 ? `+${formatPrice(option.extra_price)}` : "gratis"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

        </div>

        <div className="shrink-0 border-t border-[#1f1f23] px-5 pb-5 pt-4">
          <div className="flex items-stretch gap-2.5">
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-[#27272a] bg-[#18181b] px-1.5">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={isAgotado}
                className="flex h-[52px] w-10 items-center justify-center rounded-full text-2xl font-light text-[#fafafa] disabled:opacity-40"
                aria-label="Quitar uno"
              >
                −
              </button>
              <span className="min-w-6 text-center text-base font-extrabold">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                disabled={isAgotado}
                className="flex h-[52px] w-10 items-center justify-center rounded-full text-2xl font-light text-[#fafafa] disabled:opacity-40"
                aria-label="Agregar uno"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAgotado || checking || !tableId}
              className="flex h-[52px] flex-1 items-center justify-center rounded-full bg-[#fb923c] text-[15px] font-extrabold text-[#1a1a1a] shadow-[0_12px_28px_rgba(251,146,60,0.25)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#27272a] disabled:text-[#52525b] disabled:shadow-none"
            >
              {isAgotado
                ? "Agotado"
                : checking
                  ? "Verificando…"
                  : `Agregar ${qty} — ${formatPrice(activePrice * qty)}`}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
