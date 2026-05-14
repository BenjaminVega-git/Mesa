"use client"

import { useCartStore } from "@/store/cartStore"

type CartDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const items = useCartStore((state) => state.items)
  const total = useCartStore((state) => state.total)

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4 backdrop-blur-md"
      onClick={onClose}
    >
      <section
        className="max-h-[82vh] w-full max-w-md overflow-hidden rounded-[2rem] bg-stone-950/95 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-orange-200/80">Pedido actual</p>
            <h2 className="text-2xl font-black tracking-tight">Tu carrito</h2>
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
              {formatPrice(total())}
            </span>
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-center rounded-[1.35rem] bg-orange-500 px-5 py-4 text-sm font-black text-stone-950 shadow-2xl shadow-orange-500/25 ring-1 ring-orange-200/50 transition hover:bg-orange-400"
          >
            Continuar pedido
          </button>
        </footer>
      </section>
    </div>
  )
}
