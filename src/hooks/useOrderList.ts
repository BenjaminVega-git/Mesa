import { useOrders } from "@/hooks/useOrders"

export function useOrderList({ limit = 30 }: { limit?: number } = {}) {
  const { orders, loading, error, refresh } = useOrders({ limit })

  const activeOrdersCount = orders.length

  return {
    orders,
    activeOrdersCount,
    loading,
    error,
    refresh,
  }
}
