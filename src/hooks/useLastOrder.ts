import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useCartStore } from "@/store/cartStore"
import type { StoredOrder } from "@/types/cart-store"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"

function getOrderStatusName(orderStatus: unknown) {
  if (Array.isArray(orderStatus)) return orderStatus[0]?.status_name ?? null
  if (orderStatus && typeof orderStatus === "object" && "status_name" in orderStatus)
    return (orderStatus as { status_name: string | null }).status_name ?? null
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

async function getOrderStatusNameById(statusId: number | null) {
  if (!statusId) return null

  const { data, error } = await supabase
    .from("order_status")
    .select("status_name")
    .eq("id", statusId)
    .maybeSingle()

  if (error) throw error
  return data?.status_name ?? null
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
      .select("id, status_id, created_at, qr_code_id, table_id, restaurant_id, total, order_status(status_name)")
      .eq("id", orderToSync.id)
      .maybeSingle()

    if (error) throw error

    let nextStatusName = getOrderStatusName(data?.order_status ?? null)

    if (data?.status_id && !nextStatusName) {
      nextStatusName = await getOrderStatusNameById(data.status_id)
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

  useEffect(() => {
    if (!lastOrder) return

    const channel = supabase
      .channel(`last-order-${lastOrder.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${lastOrder.id}`,
        },
        async (payload) => {
          const updatedOrder = payload.new as Partial<{
            status_id: number | null
            created_at: string
            qr_code_id: number
            table_id: number
            restaurant_id: number
            total: number
          }>

          if (updatedOrder.status_id === 3) {
            clearLastOrder()
            return
          }

          const nextStatusId = updatedOrder.status_id ?? lastOrder.statusId
          const nextStatusName =
            nextStatusId !== lastOrder.statusId
              ? await getOrderStatusNameById(nextStatusId)
              : lastOrder.statusName

          setLastOrder({
            ...lastOrder,
            statusId: nextStatusId,
            statusName: nextStatusName,
            createdAt: updatedOrder.created_at ?? lastOrder.createdAt,
            qrCodeId: updatedOrder.qr_code_id ?? lastOrder.qrCodeId,
            tableId: updatedOrder.table_id ?? lastOrder.tableId,
            restaurantId: updatedOrder.restaurant_id ?? lastOrder.restaurantId,
            total: updatedOrder.total ?? lastOrder.total,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clearLastOrder, lastOrder, setLastOrder])

  return { activeOrder, lastOrder, isChecking: isChecking || isPending, syncOrder }
}
