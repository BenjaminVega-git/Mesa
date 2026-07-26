import type { Category } from "@/types/category"
import type { ProductStatus } from "@/types/product-status"
import type { ProductVariant } from "@/types/product-variant"

// Opción de personalización de un producto (configurada en Inventario):
// 'removable' = ingrediente incluido que el comensal puede quitar (gratis);
// 'extra' = ingrediente NO incluido que el comensal puede agregar, con precio.
export type ProductIngredientOption = {
  ingredient_id: number
  name: string
  kind: "removable" | "extra"
  extra_price: number
}

// Fila de configuración en el panel admin (Inventario): un insumo del
// restaurante, configurado o no todavía para este producto. kind=null = sin
// configurar ("No aplica").
export type IngredientOptionConfigRow = {
  ingredientId: number
  name: string
  unit: string
  kind: "removable" | "extra" | null
  extraPrice: number
  /** Cuánto insumo consume UN extra (en su unidad). Irrelevante si es removable. */
  quantity: number
}

export type Product = {
  id: number
  product_name: string
  product_description: string | null
  product_image: string | null
  product_image_public_id: string | null
  product_price: number
  category_id: number
  restaurant_id: number
  status_id: number
  // Agotado automático por receta (insumo insuficiente). Lo expone get_public_menu.
  stock_out?: boolean
  created_at: string
  // true si la imagen es un recorte sin fondo (PNG transparente). Lo fija el
  // admin con el toggle "quitar fondo"; el menú lo usa para NO aplicar el
  // efecto blur+degradado a los recortes.
  image_recortada?: boolean
  categories: Category
  product_status?: ProductStatus
  product_variants?: ProductVariant[]
  // Opciones de personalización disponibles (comensal y POS del staff). Lo
  // expone get_public_menu / staff_get_menu; vacío si el admin no configuró.
  ingredient_options?: ProductIngredientOption[]
}
