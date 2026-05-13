import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import type { Product } from "@/types/product"

export function useProductDetail(productId: number | null) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!productId) return

    async function loadProduct() {
      try {
        setLoading(true)
        setError("")

        const { data, error } = await supabase
          .from("products")
          .select(`*, categories ( category_name )`)
          .eq("id", productId)
          .maybeSingle()

        if (error) throw error
        if (!data) throw new Error("Producto no encontrado")

        setProduct(data)
      } catch (err) {
        logger.error("Error cargando producto", err)
        setError(err instanceof Error ? err.message : "Error desconocido")
      } finally {
        setLoading(false)
      }
    }

    loadProduct()
  }, [productId])

  return { product, loading, error }
}