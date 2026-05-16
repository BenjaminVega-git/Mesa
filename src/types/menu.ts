import type { Restaurant } from "@/types/restaurant"
import type { Product } from "@/types/product"
import type { Category } from "@/types/category"


export interface MenuData {
  restaurant: Restaurant | null
  categories: Category[]
  products: Product[]
  tableId: number | null
  tableNumber: number | null
}
