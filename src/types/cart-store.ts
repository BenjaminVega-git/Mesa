import type { CartItem } from "@/types/cart-item"

export type StoredOrder = {
  id: number
  qrCode: string
  qrCodeId: number
  statusName: string | null
  createdAt: string
  tableId: number
  restaurantId: number
  total: number
}

export interface CartStore {
  items: CartItem[]
  lastOrder: StoredOrder | null
  addItem: (product: CartItem) => void
  removeItem: (id: number) => void
  updateQuantity: (id: number, quantity: number) => void
  clear: () => void
  setLastOrder: (order: StoredOrder) => void
  clearLastOrder: () => void
}
