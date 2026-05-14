import type { CartItem } from "@/types/cart-item"

export interface CartStore {
  items: CartItem[]
  addItem: (product: CartItem) => void
  removeItem: (id: number) => void
  updateQuantity: (id: number, quantity: number) => void
  clear: () => void
}