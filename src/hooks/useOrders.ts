import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { useRestaurantId } from "@/hooks/useRestaurantId"
import { isNetworkError, useOfflineRetry } from "@/hooks/useOfflineRetry"
import type { Order } from "@/types/order"

export function useOrders({ limit = 30 }: { limit?: number } = {}) {
  const { restaurantId, loading: loadingId, error: idError } = useRestaurantId()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const { run: loadOrdersWithRetry, isPending } = useOfflineRetry(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, table_id, total, status_id, created_at, order_status(status_name), tables(table_number), order_qr_codes(qr_code, qr_active)")
      .eq("restaurant_id", restaurantId)
      .in("status_id", [1, 2, 3])
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error

    setOrders((data ?? []) as unknown as Order[])
    setError("")
  })

  useEffect(() => {
    if (!restaurantId) return

    async function loadOrders() {
      try {
        setLoading(true)
        setError("")

        await loadOrdersWithRetry()
      } catch (err: unknown) {
        if (isNetworkError(err)) return
        logger.error("Error cargando pedidos", err)
        setError("Error al cargar pedidos")
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [loadOrdersWithRetry, restaurantId])

  return {
    orders,
    loading: loadingId || loading || isPending,
    error: idError || error,
  }
}
