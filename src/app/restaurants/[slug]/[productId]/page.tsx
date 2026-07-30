import { notFound } from "next/navigation"
import { createSupabaseAnonClient } from "@/lib/supabase/anon"
import { decodeId } from "@/lib/hashids"
import { PublicProductDetailClient } from "./PublicProductDetailClient"
import type { MenuTemplate } from "@/types/restaurant"

type Params = Promise<{ slug: string; productId: string }>

type Variant = {
  id: number
  variant_name: string
  variant_description: string | null
  variant_price: number
  variant_image: string | null
}

export type PublicProductRow = {
  id: number
  product_name: string
  product_description: string | null
  product_price: number
  product_image: string | null
  category_id: number
  status_id: number
  category_name: string | null
  variants: Variant[]
}

export type PublicRestaurantInfo = {
  id: number
  restaurant_name: string
  restaurant_logo: string | null
  restaurant_city: string | null
  menu_template: MenuTemplate
  delivery_slug: string
}

type RpcResult = {
  restaurant: PublicRestaurantInfo
  categories: Array<{ id: number; category_name: string }>
  products: PublicProductRow[]
}

export const revalidate = 60

// Cuando se reactive delivery, cambiar a true.
const DELIVERY_ENABLED = false

export default async function PublicProductPage({ params }: { params: Params }) {
  if (!DELIVERY_ENABLED) notFound()

  const { slug, productId } = await params

  const realProductId = decodeId(productId)
  if (!realProductId) notFound()

  const supabase = createSupabaseAnonClient()
  const { data, error } = await supabase.rpc("get_restaurant_by_slug", { p_slug: slug })
  if (error || !data) notFound()

  const result = data as unknown as RpcResult
  const product = result.products.find((p) => p.id === realProductId && p.status_id === 1)
  if (!product) notFound()

  return (
    <PublicProductDetailClient
      restaurant={result.restaurant}
      product={product}
    />
  )
}
