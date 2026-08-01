export type ProductVariant = {
  id: number
  product_id: number
  variant_name: string
  variant_description: string | null
  variant_price: number
  codigo: string | null
  variant_image: string | null
  variant_image_public_id: string | null
  created_at: string
  // Agotado automático por receta (insumo insuficiente). Lo expone get_public_menu.
  stock_out?: boolean
}
