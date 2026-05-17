"use client"

import { useEffect, useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { useCartStore, useCartTotal } from "@/store/cartStore"
import { CartItem } from "@/types/cart-item"
import { CartDrawerProps } from "@/types/cart-drawer"
import type { StoredOrder } from "@/types/cart-store"
import { useCreateOrder } from "@/hooks/useCreateOrder"
import { useLastOrder } from "@/hooks/useLastOrder"
import { supabase } from "@/lib/supabase"

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

type OrderStatusRelation = { nombre: string | null } | { nombre: string | null }[] | null

function getOrderStatusName(orderStatus: OrderStatusRelation) {
  if (Array.isArray(orderStatus)) return orderStatus[0]?.nombre ?? null
  return orderStatus?.nombre ?? null
}

function getStoredOrderStatusLabel(order: StoredOrder) {
  return order.statusName ?? "Actualizando estado"
}

function CartView({
  items,
  total,
  hasItems,
  isLoading,
  error,
  onContinue,
}: {
  items: CartItem[]
  total: number
  hasItems: boolean
  isLoading: boolean
  error: string | null
  onContinue: () => void
}) {
  return (
    <>
      <div className="max-h-[48vh] overflow-y-auto px-5 py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/5 px-5 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/20 text-2xl font-black text-orange-100 ring-1 ring-orange-200/20">
              +
            </div>
            <h3 className="mt-4 text-lg font-black">Aun no hay productos</h3>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              Cuando agregues algo del menu, aparecera aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex gap-3 rounded-[1.5rem] bg-white/10 p-3 ring-1 ring-white/10"
              >
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-stone-900">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-xs font-bold text-stone-400">Sin imagen</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-black leading-tight">{item.name}</h3>
                  <p className="mt-2 text-xs font-semibold text-stone-400">
                    Cantidad: {item.quantity}
                  </p>
                  <p className="mt-1 text-sm font-black text-orange-200">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 px-5 py-5">
        {error && (
          <p className="mb-3 text-center text-xs font-semibold text-red-400">{error}</p>
        )}

        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold text-stone-300">Total</span>
          <span className="text-2xl font-black text-orange-200">{formatPrice(total)}</span>
        </div>

        <button
          type="button"
          disabled={!hasItems || isLoading}
          onClick={onContinue}
          className={`flex w-full items-center justify-center rounded-[1.35rem] px-5 py-4 text-sm font-black ring-1 transition ${
            hasItems && !isLoading
              ? "bg-orange-500 text-stone-950 shadow-2xl shadow-orange-500/25 ring-orange-200/50 hover:bg-orange-400"
              : "cursor-not-allowed bg-stone-800 text-stone-500 ring-white/10"
          }`}
        >
          {isLoading ? "Creando pedido..." : "Continuar pedido"}
        </button>
      </footer>
    </>
  )
}

function ActiveOrderView({
  order,
  isChecking,
  onRefresh,
}: {
  order: StoredOrder
  isChecking: boolean
  onRefresh: () => void
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-6 text-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <h3 className="mt-5 text-2xl font-black tracking-tight text-white">
          Tu pedido ya esta en marcha
        </h3>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-stone-300">
          Lo registramos correctamente. Espera a que el equipo lo prepare antes
          de hacer otro pedido.
        </p>

        <div className="mx-auto mt-6 max-w-xs rounded-[1.5rem] bg-white/10 px-4 py-4 text-left ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">
              Estado
            </span>
            <span className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-black text-orange-200 ring-1 ring-orange-200/20">
              {getStoredOrderStatusLabel(order)}
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-stone-300">Total</span>
            <span className="text-xl font-black text-orange-200">
              {formatPrice(order.total)}
            </span>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 px-5 py-4">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isChecking}
          className="flex w-full items-center justify-center rounded-[1.35rem] bg-white/10 px-5 py-4 text-sm font-black text-orange-100 ring-1 ring-white/10 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:text-stone-500"
        >
          {isChecking ? "Revisando..." : "Actualizar estado"}
        </button>
      </footer>
    </>
  )
}

function QrView({
  total,
  qrCode,
  tableId,
  restaurantId,
  onCancel,
}: {
  total: number
  qrCode: string
  tableId: number
  restaurantId: number
  onCancel: () => void
}) {
  const clearCart = useCartStore((state) => state.clear)
  const setLastOrder = useCartStore((state) => state.setLastOrder)
  const [isRegistered, setIsRegistered] = useState(false)

  const scanUrl = useMemo(() => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const url = new URL(`/scan/${qrCode}`, baseUrl)
    url.searchParams.set("tableId", String(tableId))
    url.searchParams.set("restaurantId", String(restaurantId))
    url.searchParams.set("total", String(total))
    return url.toString()
  }, [qrCode, restaurantId, tableId, total])

  useEffect(() => {
    let isMounted = true

    async function checkRegisteredOrder() {
      const { data: qrData } = await supabase
        .from("order_qr_codes")
        .select("id")
        .eq("qr_code", qrCode)
        .maybeSingle()

      if (!qrData) return

      const { data: orderData } = await supabase
        .from("orders")
        .select("id, status_id, created_at, qr_code_id, table_id, restaurant_id, total, order_status(nombre)")
        .eq("qr_code_id", qrData.id)
        .maybeSingle()

      if (orderData && isMounted) {
        setIsRegistered(true)
        setLastOrder({
          id: orderData.id,
          qrCode,
          qrCodeId: qrData.id,
          statusId: orderData.status_id,
          statusName: getOrderStatusName(orderData.order_status),
          createdAt: orderData.created_at,
          tableId: orderData.table_id,
          restaurantId: orderData.restaurant_id,
          total: orderData.total,
        })
        clearCart()
      }
    }

    checkRegisteredOrder()
    const intervalId = window.setInterval(checkRegisteredOrder, 2500)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [clearCart, qrCode, setLastOrder])

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-5 text-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <h3 className="text-xl font-black tracking-tight text-white sm:text-2xl">
          {isRegistered ? "Pedido registrado, espera a que lo preparen" : "Muestra este codigo al mesero"}
        </h3>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-stone-300">
          {isRegistered
            ? "Ya lo enviamos al equipo. Te avisaran cuando este listo."
            : "El mesero confirmara tu pedido desde la mesa."}
        </p>

        {isRegistered ? (
          <div className="mx-auto mt-5 flex h-48 w-48 items-center justify-center rounded-[1.75rem] bg-emerald-500/15 text-6xl font-black text-emerald-200 shadow-2xl shadow-emerald-500/10 ring-1 ring-emerald-200/30 sm:h-52 sm:w-52">
            OK
          </div>
        ) : (
          <div className="mx-auto mt-5 flex h-48 w-48 items-center justify-center rounded-[1.75rem] bg-white p-4 shadow-2xl shadow-orange-500/10 ring-1 ring-orange-200/30 sm:h-52 sm:w-52">
            <QRCodeSVG
              value={scanUrl}
              size={156}
              bgColor="#ffffff"
              fgColor="#0c0a09"
              className="h-full w-full"
            />
          </div>
        )}

        <p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-orange-200">
          Codigo del pedido
        </p>
      </div>

      <footer className="shrink-0 border-t border-white/10 px-5 py-4">
        <div className="mb-4 flex items-center justify-between rounded-[1.25rem] bg-white/10 px-4 py-3 ring-1 ring-white/10">
          <span className="text-sm font-black text-stone-300">Total</span>
          <span className="text-2xl font-black text-orange-200">{formatPrice(total)}</span>
        </div>

        {!isRegistered && (
          <button
            type="button"
            onClick={onCancel}
            className="flex w-full items-center justify-center rounded-[1.35rem] bg-red-500/10 px-5 py-4 text-sm font-black text-red-100 ring-1 ring-red-300/20 transition hover:bg-red-500/15"
          >
            Cancelar pedido
          </button>
        )}
      </footer>
    </>
  )
}

export function CartDrawer({ isOpen, onClose, tableId, restaurantId }: CartDrawerProps) {
  const items = useCartStore((state) => state.items)
  const total = useCartTotal()
  const hasItems = items.length > 0

  const { qrCode, isLoading, error, createOrder, cancelOrder } = useCreateOrder({
    items,
    tableId,
    restaurantId,
  })

  const { activeOrder, isChecking, syncOrder } = useLastOrder()

  useEffect(() => {
    if (!isOpen || !activeOrder) return
    const timeoutId = window.setTimeout(() => syncOrder(activeOrder), 0)
    return () => window.clearTimeout(timeoutId)
  }, [isOpen, activeOrder, syncOrder])

  const isQrVisible = !!qrCode

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4 backdrop-blur-md"
      onClick={onClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-stone-950/95 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-orange-200/80">
              {activeOrder ? "Pedido en curso" : isQrVisible ? "" : "Pedido actual"}
            </p>
            <h2 className="text-2xl font-black tracking-tight">
              {activeOrder ? "Espera un momento" : isQrVisible ? "Pedido listo" : "Tu carrito"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-black text-orange-100 ring-1 ring-white/10 transition hover:bg-white/15"
            aria-label="Cerrar carrito"
          >
            x
          </button>
        </header>

        {activeOrder ? (
          <ActiveOrderView
            order={activeOrder}
            isChecking={isChecking}
            onRefresh={() => syncOrder(activeOrder)}
          />
        ) : isQrVisible ? (
          <QrView
            total={total}
            qrCode={qrCode}
            tableId={tableId}
            restaurantId={restaurantId}
            onCancel={cancelOrder}
          />
        ) : (
          <CartView
            items={items}
            total={total}
            hasItems={hasItems}
            isLoading={isLoading}
            error={error}
            onContinue={createOrder}
          />
        )}
      </section>
    </div>
  )
}
