"use client"

import { useState } from "react"
import { CartDrawer } from "@/components/customer/CartDrawer"
import { useCartStore } from "@/store/cartStore"

export function FloatingCartButton() {
  const [isCartOpen, setIsCartOpen] = useState(false)
  const items = useCartStore((state) => state.items)
  const total = useCartStore((state) => state.total)

  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0)

  return (
    <>
      <button
        className="fixed bottom-5 right-5 z-10 flex items-center gap-3 rounded-full bg-orange-500 px-5 py-4 text-stone-950 shadow-2xl shadow-orange-500/30 ring-1 ring-orange-200/50 transition hover:bg-orange-400"
        type="button"
        aria-label="Abrir carrito"
        onClick={() => setIsCartOpen(true)}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-950 text-sm font-black text-orange-200">
          {itemCount}
        </span>
        <span className="text-sm font-black">Carrito</span>
        <span className="text-sm font-black">${total()}</span>
      </button>

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
    </>
  )
}
