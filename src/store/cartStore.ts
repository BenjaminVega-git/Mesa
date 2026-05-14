import { create } from "zustand"
import { persist } from "zustand/middleware"

interface CartItem {
  id: number
  name: string
  price: number
  quantity: number
  image?: string
}

interface CartStore {
  items: CartItem[]
  addItem: (product: CartItem) => void
  removeItem: (id: number) => void
  updateQuantity: (id: number, quantity: number) => void
  clear: () => void
  total: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

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

      total: () =>
        get().items.reduce((acc, i) => acc + i.price * i.quantity, 0),
    }),
    { name: "cart" }
  )
)