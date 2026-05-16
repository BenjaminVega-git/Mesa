import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CartStore } from "@/types/cart-store"


export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      lastOrder: null,

      addItem: (product) =>
        set((state) => {
          const existing = state.items.find((i) => i.id === product.id)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            }
          }
          return { items: [...state.items, { ...product, quantity: 1 }] }
        }),

      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, quantity } : i)),
        })),

      clear: () => set({ items: [] }),

      setLastOrder: (order) => set({ lastOrder: order }),

      clearLastOrder: () => set({ lastOrder: null }),
    }),
    { name: "cart" }
  )
)

export const useCartTotal = () =>
  useCartStore((state) =>
    state.items.reduce((acc, i) => acc + i.price * i.quantity, 0)
  )
