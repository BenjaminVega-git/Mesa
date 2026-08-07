"use client"

import { useState } from "react"
import { CartDrawer } from "@/components/customer/CartDrawer"
import { useTableCart } from "@/hooks/useTableCart"
import { getCartTargetId } from "@/lib/customer/fly-to-cart"

type FloatingCartButtonProps = {
  tableId: number
  restaurantId: number
  locationCheckEnabled?: boolean
}

export function FloatingCartButton({ tableId, restaurantId, locationCheckEnabled }: FloatingCartButtonProps) {
  const [isCartOpen, setIsCartOpen] = useState(false)
  const { items, total } = useTableCart(tableId, restaurantId)

  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0)

  if (itemCount === 0) return null

  return (
    <>
      <button
        id={getCartTargetId()}
        className="fixed bottom-4 left-1/2 z-30 flex h-[56px] w-[calc(100%-32px)] max-w-[408px] -translate-x-1/2 items-center gap-3 rounded-full bg-[#fb923c] px-[18px] text-[#1a1a1a] shadow-[0_10px_30px_rgba(251,146,60,0.3)] transition active:scale-[0.98]"
        type="button"
        aria-label="Ver pedido"
        onClick={() => setIsCartOpen(true)}
      >
        <span className="relative flex shrink-0 items-center">
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M16 10a4 4 0 0 1-8 0" />
          </svg>
          <span className="absolute -right-[9px] -top-[7px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#1a1a1a] px-1 text-[10.5px] font-extrabold text-[#fb923c]">
            {itemCount}
          </span>
        </span>
        <span className="flex-1 text-left text-[15px] font-extrabold">Ver pedido</span>
        <span className="text-[15.5px] font-extrabold">${total.toLocaleString("es-CL")}</span>
      </button>

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        tableId={tableId}
        restaurantId={restaurantId}
        locationCheckEnabled={locationCheckEnabled}
      />
    </>
  )
}
