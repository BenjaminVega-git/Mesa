"use client"

import { useEffect, useState } from "react"
import { useCartStore } from "@/store/cartStore"
import { useTableCart } from "@/hooks/useTableCart"
import { useTableCartStore } from "@/store/tableCartStore"
import { CartItem } from "@/types/cart-item"
import { CartDrawerProps } from "@/types/cart-drawer"
import type { StoredOrder } from "@/types/cart-store"
import { useCreateOrder } from "@/hooks/useCreateOrder"
import { isStoredOrderInProgress, useLastOrder } from "@/hooks/useLastOrder"
import { listAvailableCoupons, type AvailableCoupon } from "@/services/discounts-service"

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

// Estimación del descuento en el carrito. Exacta para "toda la carta"; para
// categoría/producto no tenemos ese dato en el cliente → el monto real se
// confirma al enviar el pedido (lo calcula el servidor). Nunca aplica sobre
// líneas de promoción (promotionId).
function estimateDiscount(items: CartItem[], coupon: AvailableCoupon | null): number | null {
  if (!coupon) return null
  if (coupon.scope !== "all") return null
  const base = items.reduce((acc, i) => (i.promotionId ? acc : acc + i.price * i.quantity), 0)
  if (coupon.min_order_amount && items.reduce((a, i) => a + i.price * i.quantity, 0) < coupon.min_order_amount) {
    return 0
  }
  const raw = coupon.discount_type === "percent" ? Math.round((base * coupon.discount_value) / 100) : Math.min(coupon.discount_value, base)
  return Math.max(0, raw)
}

function CartView({
  items,
  total,
  hasItems,
  isLoading,
  isWaitingConnection,
  error,
  onContinue,
  coupons,
  selectedCode,
  onToggleCoupon,
}: {
  items: CartItem[]
  total: number
  hasItems: boolean
  isLoading: boolean
  isWaitingConnection: boolean
  error: string | null
  onContinue: () => void
  coupons: AvailableCoupon[]
  selectedCode: string | null
  onToggleCoupon: (code: string | null) => void
}) {
  const updateQuantity = useTableCartStore((state) => state.updateQuantity)
  const removeItem = useTableCartStore((state) => state.removeItem)
  const selectedCoupon = coupons.find((c) => c.code === selectedCode) ?? null
  const estDiscount = estimateDiscount(items, selectedCoupon)
  const displayTotal = Math.max(0, total - (estDiscount ?? 0))
  return (
    <>
      <div className="max-h-[48vh] flex-1 overflow-y-auto px-5 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-[#27272a] bg-[#18181b] px-5 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fb923c]/20 text-2xl font-black text-[#fb923c] ring-1 ring-[#fb923c]/20">
              +
            </div>
            <h3 className="mt-4 text-lg font-black">Aun no hay productos</h3>
            <p className="mt-2 text-sm leading-6 text-[#a1a1aa]">
              Cuando agregues algo del menu, aparecera aqui.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#161618]">
            {items.map((item) => (
              <article key={item.id} className="flex items-center gap-3 py-3">
                <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] bg-[#18181b]">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-[#52525b]">Sin foto</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{item.name}</p>
                  {item.dinerLabel && (
                    <p className="text-[11px] font-semibold uppercase text-[#fb923c]">
                      {item.dinerLabel}
                    </p>
                  )}
                  {item.selectionLabels && item.selectionLabels.length > 0 && (
                    <p className="line-clamp-2 text-[11px] leading-4 text-[#71717a]">
                      {item.selectionLabels.join(" · ")}
                    </p>
                  )}
                  {item.ingredientLabels && item.ingredientLabels.length > 0 && (
                    <p className="line-clamp-2 text-[11px] leading-4 text-[#71717a]">
                      {item.ingredientLabels.join(" · ")}
                    </p>
                  )}
                  {item.menuOptionLabels && item.menuOptionLabels.length > 0 && (
                    <p className="line-clamp-2 text-[11px] leading-4 text-[#71717a]">
                      {item.menuOptionLabels.join(" · ")}
                    </p>
                  )}
                  <p className="mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 rounded-full bg-[#18181b] px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      item.quantity === 1
                        ? removeItem(item.id)
                        : updateQuantity(item.id, item.quantity - 1)
                    }
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#27272a] text-sm font-black text-[#fafafa] transition hover:bg-[#3f3f46]"
                    aria-label="Quitar uno"
                  >
                    −
                  </button>
                  <span className="min-w-[14px] text-center text-sm font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#fb923c] text-sm font-black text-[#1a1a1a]"
                    aria-label="Agregar uno"
                  >
                    +
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-[#1f1f23] px-5 pb-6 pt-4">
        {/* Cupones disponibles */}
        {hasItems && coupons.length > 0 && (
          <div className="mb-3.5">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#fb923c]">
              🎟 Cupones disponibles
            </p>
            <div className="flex flex-wrap gap-2">
              {coupons.map((c) => {
                const on = c.code === selectedCode
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggleCoupon(on ? null : c.code)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
                      on
                        ? "border-[#fb923c] bg-[#fb923c] text-[#1a1a1a]"
                        : "border-[#27272a] bg-[#18181b] text-[#d4d4d8]"
                    }`}
                  >
                    {c.description || c.code}
                    {c.discount_type === "percent" ? ` · ${c.discount_value}%` : ` · ${formatPrice(c.discount_value)}`}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="mb-3 text-center text-xs font-semibold text-red-400">{error}</p>
        )}

        {estDiscount != null && estDiscount > 0 && (
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="font-semibold text-[#a1a1aa]">Subtotal</span>
            <span className="font-semibold text-[#a1a1aa]">{formatPrice(total)}</span>
          </div>
        )}
        {selectedCoupon && (
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="font-semibold text-[#fb923c]">Cupón {selectedCoupon.code}</span>
            <span className="font-semibold text-[#fb923c]">
              {estDiscount != null ? `−${formatPrice(estDiscount)}` : "al enviar"}
            </span>
          </div>
        )}

        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#a1a1aa]">Total</span>
          <span className="text-[22px] font-black">{formatPrice(displayTotal)}</span>
        </div>

        <button
          type="button"
          disabled={!hasItems || isLoading}
          onClick={onContinue}
          className={`flex h-[52px] w-full items-center justify-center gap-2 rounded-full text-[15.5px] font-extrabold transition active:scale-[0.98] ${
            hasItems && !isLoading
              ? "bg-[#fb923c] text-[#1a1a1a]"
              : "cursor-not-allowed bg-[#27272a] text-[#52525b]"
          }`}
        >
          {isWaitingConnection
            ? "Esperando conexion..."
            : isLoading
              ? "Enviando pedido..."
              : (
                <>
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                  </svg>
                  Enviar pedido a cocina
                </>
              )}
        </button>
      </footer>
    </>
  )
}


export function CartDrawer({ isOpen, onClose, tableId, restaurantId, locationCheckEnabled }: CartDrawerProps) {
  const { items, total } = useTableCart(tableId, restaurantId)
  const hasItems = items.length > 0
  const qrCode = useTableCartStore((s) => s.qrCode)
  const [coupons, setCoupons] = useState<AvailableCoupon[]>([])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const {
    isLoading,
    isWaitingConnection,
    error,
    createOrder,
    resetOrderDraft,
  } = useCreateOrder({
    items,
    tableId,
    restaurantId,
    couponCode: selectedCode,
    locationCheckEnabled,
  })

  // Cupones vigentes al abrir el carrito (los filtra el servidor por día/hora).
  useEffect(() => {
    if (!isOpen || !qrCode) return
    let active = true
    listAvailableCoupons(qrCode)
      .then((list) => {
        if (active) setCoupons(list)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [isOpen, qrCode])

  const { activeOrder, isChecking, syncOrder } = useLastOrder()

  useEffect(() => {
    if (!isOpen || !activeOrder) return
    const timeoutId = window.setTimeout(() => syncOrder(activeOrder), 0)
    return () => window.clearTimeout(timeoutId)
  }, [isOpen, activeOrder, syncOrder])

  async function refreshActiveOrder(order: StoredOrder) {
    await syncOrder(order)

    if (!isStoredOrderInProgress(useCartStore.getState().lastOrder)) {
      resetOrderDraft()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <section
        className="flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[28px] bg-[#0f0f10] text-[#fafafa] shadow-2xl shadow-black/50 sm:mb-4 sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-[#1f1f23] px-5 py-5">
          <h2 className="text-[19px] font-black tracking-tight">Tu pedido</h2>

          <button
            type="button"
            onClick={onClose}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#18181b] text-lg font-black text-[#a1a1aa] transition hover:text-[#fafafa]"
            aria-label="Cerrar carrito"
          >
            ×
          </button>
        </header>

        {activeOrder ? (
          <div className="border-b border-[#1f1f23] bg-[#fb923c]/10 px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#fb923c]">
                  Pedido en curso
                </p>
                <p className="mt-1 truncate text-xs font-bold text-[#d4d4d8]">
                  {activeOrder.statusName ?? "Actualizando estado"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => refreshActiveOrder(activeOrder)}
                disabled={isChecking}
                className="shrink-0 rounded-full bg-[#18181b] px-3 py-1.5 text-[0.7rem] font-black text-[#fb923c] ring-1 ring-[#27272a] transition hover:bg-[#27272a] disabled:cursor-not-allowed disabled:text-[#52525b]"
              >
                {isChecking ? "..." : "Actualizar"}
              </button>
            </div>
          </div>
        ) : null}

        <CartView
          items={items}
          total={total}
          hasItems={hasItems}
          isLoading={isLoading}
          isWaitingConnection={isWaitingConnection}
          error={error}
          onContinue={createOrder}
          coupons={coupons}
          selectedCode={selectedCode}
          onToggleCoupon={setSelectedCode}
        />
      </section>
    </div>
  )
}
