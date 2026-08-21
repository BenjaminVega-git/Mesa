import type { PublicRestaurant } from "@/types/restaurant"
import type { Product } from "@/types/product"
import type { Category } from "@/types/category"

// Grupo de elección de una promo "arma tu promo" (build). La UI cruza
// category_id con los products del menú (status disponible) para las opciones.
export interface MenuPromotionGroup {
  id: number
  name: string
  category_id: number
  min_select: number
  max_select: number
}

// Promoción (combo) tal como la ve el comensal en el menú.
export interface MenuPromotion {
  id: number
  kind: "fixed" | "build" | "mixed"
  name: string
  description: string | null
  /** Precio del combo fijo. En 'build'/'mixed' es 0 (el total depende de lo elegido). */
  promo_price: number
  /** Solo 'build'/'mixed': tipo de descuento sobre la suma del combo. */
  discount_type: "percent" | "amount"
  /** Solo 'build'/'mixed': % de descuento sobre la suma del combo. */
  discount_pct: number | null
  /** Solo 'build'/'mixed': monto fijo de descuento sobre la suma del combo. */
  discount_amount: number | null
  /** Solo 'build'/'mixed': total más barato posible ("desde $X"), ya con el % aplicado. */
  min_price: number | null
  image_url: string | null
  original_total: number
  items: { product_name: string; variant_name: string | null; quantity: number }[]
  groups: MenuPromotionGroup[]
}

export interface MenuData {
  restaurant: PublicRestaurant | null
  categories: Category[]
  products: Product[]
  promotions: MenuPromotion[]
  tableId: number | null
  tableNumber: number | null
  // Reserva activa de la mesa (hint inicial desde SSR; el cliente la reconfirma
  // en vivo con check_table_reservation porque este payload está cacheado 5 min).
  reservation: { ends_at: string } | null
}
