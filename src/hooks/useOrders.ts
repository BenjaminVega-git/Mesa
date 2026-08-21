import { useCallback, useEffect, useId } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { useRestaurantId } from "@/hooks/useRestaurantId"
import { useCache } from "@/hooks/useCache"
import type { Order } from "@/types/order"

export function useOrders({ limit = 30 }: { limit?: number } = {}) {
  const { restaurantId, loading: loadingId, error: idError } = useRestaurantId()
  const instanceId = useId()

  const fetchOrders = useCallback(async (): Promise<Order[]> => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, table_id, total, status_id, created_at, order_type, fulfillment_type, delivery_customer_name, delivery_fee, order_status(status_name), tables(table_number)")
      .eq("restaurant_id", restaurantId)
      .in("status_id", [1, 2, 3])
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error

    return (data ?? []) as unknown as Order[]
  }, [limit, restaurantId])

  const { data, isLoading, isPendingRetry, error, refresh } = useCache<Order[]>(
    `orders-${restaurantId ?? "pending"}-${limit}`,
    fetchOrders,
    { enabled: Boolean(restaurantId), revalidateOnMount: true }
  )

  useEffect(() => {
    if (!restaurantId) return

    const channel = supabase
      .channel(`orders-list-${restaurantId}-${limit}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => refresh()
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          logger.warn(`Realtime orders-list channel: ${status}`)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, limit, refresh, instanceId])

  if (error) {
    logger.error("Error cargando pedidos", error)
  }

  return {
    orders: data ?? [],
    loading: loadingId || isLoading || isPendingRetry,
    error: idError || (error ? "Error al cargar pedidos" : ""),
    refresh,
  }
}
