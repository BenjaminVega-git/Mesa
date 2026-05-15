import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import type { MenuData } from "@/types/menu"
import { Category } from "@/types/category"

export function useMenuData(qrCode: string) {
  const [data, setData] = useState<MenuData>({
    restaurant: null,
    categories: [],
    products: [],
    tableNumber: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!qrCode) return

    async function fetchMenu() {
      try {
        setLoading(true)
        setError("")

        // 1. Obtener id del QR
        const { data: qrData, error: qrError } = await supabase
          .from("table_qr_codes")
          .select("id")
          .eq("qr_code", qrCode)
          .single()

        if (qrError || !qrData) throw new Error("QR no válido")

        // 2. Obtener mesa con ese qr_code_id
        const { data: tableData, error: tableError } = await supabase
          .from("tables")
          .select("table_number, restaurant_id")
          .eq("qr_code_id", qrData.id)
          .single()

        if (tableError || !tableData) throw new Error("Mesa no encontrada")

        const { restaurant_id, table_number } = tableData

        // 3. Restaurante, productos y categorías en paralelo
        const [restaurantRes, productsRes, categoriesRes] = await Promise.all([
          supabase
            .from("restaurants")
            .select("id, restaurant_name, restaurant_logo")
            .eq("id", restaurant_id)
            .single(),
          supabase
            .from("products")
            .select(`*, categories ( category_name )`)
            .eq("restaurant_id", restaurant_id),
          supabase
            .from("categories")
            .select("id, category_name")
            .eq("restaurant_id", restaurant_id),
        ])

        if (restaurantRes.error) throw restaurantRes.error
        if (productsRes.error) throw productsRes.error
        if (categoriesRes.error) throw categoriesRes.error

        setData({
          restaurant: restaurantRes.data,
          products: productsRes.data ?? [],
          categories: (categoriesRes.data ?? []) as Category[],
          tableNumber: table_number,
        })
      } catch (err: unknown) {
        logger.error("Error cargando menú", err)
        setError("No se pudo cargar el menú")
      } finally {
        setLoading(false)
      }
    }

    fetchMenu()
  }, [qrCode])

  return { ...data, loading, error }
}