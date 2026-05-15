"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { useCartStore, useCartTotal } from "@/store/cartStore"

type CartDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const [showFakeQr, setShowFakeQr] = useState(false)
  const items = useCartStore((state) => state.items)
  const total = useCartTotal()
  const hasItems = items.length > 0

  function handleClose() {
    setShowFakeQr(false)
    onClose()
  }

  function handleContinueOrder() {
    if (!hasItems) return
    setShowFakeQr(true)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4 backdrop-blur-md"
      onClick={handleClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-stone-950/95 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-orange-200/80">
              {showFakeQr ? "Confirmación visual" : "Pedido actual"}
            </p>
            <h2 className="text-2xl font-black tracking-tight">
              {showFakeQr ? "Pedido listo" : "Tu carrito"}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-black text-orange-100 ring-1 ring-white/10 transition hover:bg-white/15"
            aria-label="Cerrar carrito"
          >
            x
          </button>
        </header>

        {showFakeQr ? (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5 text-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <h3 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Muestra este código al mesero
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-stone-300">
                El mesero confirmará tu pedido desde la mesa.
              </p>

              <div className="mx-auto mt-5 flex h-48 w-48 items-center justify-center rounded-[1.75rem] bg-white p-4 shadow-2xl shadow-orange-500/10 ring-1 ring-orange-200/30 sm:h-52 sm:w-52">
                <QRCodeSVG
                  value="MESA_FAKE_ORDER_QR"
                  size={156}
                  bgColor="#ffffff"
                  fgColor="#0c0a09"
                  className="h-full w-full"
                />
              </div>

              <p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-orange-200">
                Código ficticio de pedido
              </p>
            </div>

            <footer className="shrink-0 border-t border-white/10 px-5 py-4">
              <div className="mb-4 flex items-center justify-between rounded-[1.25rem] bg-white/10 px-4 py-3 ring-1 ring-white/10">
                <span className="text-sm font-black text-stone-300">Total</span>
                <span className="text-2xl font-black text-orange-200">
                  {formatPrice(total)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowFakeQr(false)}
                className="flex w-full items-center justify-center rounded-[1.35rem] bg-white/10 px-5 py-4 text-sm font-black text-orange-100 ring-1 ring-white/10 transition hover:bg-white/15"
              >
                Volver al carrito
              </button>
            </footer>
          </>
        ) : (
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
                        <h3 className="line-clamp-2 text-sm font-black leading-tight">
                          {item.name}
                        </h3>
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
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-stone-300">Total</span>
                <span className="text-2xl font-black text-orange-200">
                  {formatPrice(total)}
                </span>
              </div>

              <button
                type="button"
                disabled={!hasItems}
                onClick={handleContinueOrder}
                className={`flex w-full items-center justify-center rounded-[1.35rem] px-5 py-4 text-sm font-black ring-1 transition ${
                  hasItems
                    ? "bg-orange-500 text-stone-950 shadow-2xl shadow-orange-500/25 ring-orange-200/50 hover:bg-orange-400"
                    : "cursor-not-allowed bg-stone-800 text-stone-500 ring-white/10"
                }`}
              >
                Continuar pedido
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
