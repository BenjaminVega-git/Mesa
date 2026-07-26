import type { CartItem, CartPromoSelection, CartIngredientChoice } from "@/types/cart-item"

export type StoredOrder = {
  id: number
  statusId: number | null
  statusName: string | null
  createdAt: string
  tableId: number
  restaurantId: number
  total: number
}

export type AddCartItemInput = {
  productId: number
  variantId?: number | null
  price: number
  quantity?: number
  notes?: string | null
  ingredientChoices?: CartIngredientChoice[] | null
}

export interface TableCartStore {
  items: CartItem[]
  tableId: number | null
  restaurantId: number | null
  qrCode: string | null
  isLoading: boolean
  setTable: (tableId: number | null, restaurantId: number | null, qrCode: string | null) => void
  fetchItems: () => Promise<void>
  addItem: (input: AddCartItemInput) => Promise<void>
  // selections solo para promos "build" (arma tu promo).
  addPromo: (
    promotionId: number,
    quantity?: number,
    selections?: CartPromoSelection[] | null
  ) => Promise<void>
  updateQuantity: (rowId: string, quantity: number) => Promise<void>
  removeItem: (rowId: string) => Promise<void>
  clear: () => Promise<void>
}

export interface LastOrderStore {
  lastOrder: StoredOrder | null
  setLastOrder: (order: StoredOrder) => void
  clearLastOrder: () => void
}
