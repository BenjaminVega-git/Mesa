import { useCallback, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useCartStore } from "@/store/cartStore"
import type { StoredOrder } from "@/types/cart-store"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"

function getOrderStatusName(orderStatus: unknown) {
  if (Array.isArray(orderStatus)) return orderStatus[0]?.nombre ?? null
  if (orderStatus && typeof orderStatus === "object" && "nombre" in orderStatus)
    return (orderStatus as { nombre: string | null }).nombre ?? null
  return null
}

function normalizeStatusName(statusName: string) {
  return statusName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function isOrderInProgress(statusName: string | null) {
  if (!statusName) return true
  return !["listo", "entregado", "cancelado", "completado", "completo", "finalizado"].includes(
    normalizeStatusName(statusName)
  )
}

function isOrderInProgressByStatus(statusId: number | null, statusName: string | null) {
  if (statusId === 3) return false
  return isOrderInProgress(statusName)
}

export function isStoredOrderInProgress(order: StoredOrder | null) {
  return !!order && isOrderInProgressByStatus(order.statusId, order.statusName)
}

export function useLastOrder() {
  const lastOrder = useCartStore((state) => state.lastOrder)
  const setLastOrder = useCartStore((state) => state.setLastOrder)
  const clearLastOrder = useCartStore((state) => state.clearLastOrder)
  const [isChecking, setIsChecking] = useState(false)
  const orderToSyncRef = useRef<StoredOrder | null>(null)

  const { run: syncOrderWithRetry, isPending } = useOfflineRetry(async () => {
    const orderToSync = orderToSyncRef.current
    if (!orderToSync) return

    const { data, error } = await supabase
      .from("orders")
      .select("id, status_id, created_at, qr_code_id, table_id, restaurant_id, total, order_status(nombre)")
      .eq("id", orderToSync.id)
      .maybeSingle()

    if (error) throw error

    let nextStatusName = getOrderStatusName(data?.order_status ?? null)

    if (data?.status_id && !nextStatusName) {
      const { data: statusData, error: statusError } = await supabase
        .from("order_status")
        .select("nombre")
        .eq("id", data.status_id)
        .maybeSingle()

      if (statusError) throw statusError
      nextStatusName = statusData?.nombre ?? null
    }

    if (!data || !isOrderInProgressByStatus(data.status_id, nextStatusName)) {
      clearLastOrder()
      return
    }

    if (
      orderToSync.statusId !== data.status_id ||
      orderToSync.statusName !== nextStatusName ||
      orderToSync.total !== data.total ||
      orderToSync.createdAt !== data.created_at
    ) {
      setLastOrder({
        ...orderToSync,
        statusId: data.status_id,
        statusName: nextStatusName,
        createdAt: data.created_at,
        qrCodeId: data.qr_code_id,
        tableId: data.table_id,
        restaurantId: data.restaurant_id,
        total: data.total,
      })
    }
  })

  const syncOrder = useCallback(
    async (storedOrder: StoredOrder) => {
      orderToSyncRef.current = storedOrder
      setIsChecking(true)

      try {
        await syncOrderWithRetry()
      } finally {
        setIsChecking(false)
      }
    },
    [syncOrderWithRetry]
  )

  const activeOrder = isStoredOrderInProgress(lastOrder) ? lastOrder : null

  return { activeOrder, isChecking: isChecking || isPending, syncOrder }
}
