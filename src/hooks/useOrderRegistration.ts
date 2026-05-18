import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useCartStore } from "@/store/cartStore"
import { isNetworkError, useOfflineRetry } from "@/hooks/useOfflineRetry"

type OrderStatusRelation = { status_name: string | null } | { status_name: string | null }[] | null

function getOrderStatusName(orderStatus: OrderStatusRelation) {
  if (Array.isArray(orderStatus)) return orderStatus[0]?.status_name ?? null
  return orderStatus?.status_name ?? null
}

type UseOrderRegistrationProps = {
  qrCode: string
  tableId: number
  restaurantId: number
  total: number
}

export function useOrderRegistration({ qrCode }: UseOrderRegistrationProps) {
  const clearCart = useCartStore((state) => state.clear)
  const setLastOrder = useCartStore((state) => state.setLastOrder)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const { run: checkRegisteredOrderWithRetry, isPending } = useOfflineRetry(async () => {
    const { data: qrData, error: qrError } = await supabase
      .from("order_qr_codes")
      .select("id")
      .eq("qr_code", qrCode)
      .maybeSingle()

    if (qrError) throw qrError
    if (!qrData) return

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id, status_id, created_at, qr_code_id, table_id, restaurant_id, total, order_status(status_name)")
      .eq("qr_code_id", qrData.id)
      .maybeSingle()

    if (orderError) throw orderError

    if (orderData) {
      setIsRegistered(true)
      setIsOffline(false)
      setLastOrder({
        id: orderData.id,
        qrCode,
        qrCodeId: qrData.id,
        statusId: orderData.status_id,
        statusName: getOrderStatusName(orderData.order_status),
        createdAt: orderData.created_at,
        tableId: orderData.table_id,
        restaurantId: orderData.restaurant_id,
        total: orderData.total,
      })
      clearCart()
    }
  })

  useEffect(() => {
    let isMounted = true

    async function checkRegisteredOrder() {
      try {
        await checkRegisteredOrderWithRetry()
        if (isMounted) setIsOffline(false)
      } catch (err) {
        if (isMounted && isNetworkError(err)) setIsOffline(true)
      }
    }

    checkRegisteredOrder()
    const intervalId = window.setInterval(checkRegisteredOrder, 2500)

    function handleOnline() {
      setIsOffline(false)
      checkRegisteredOrder()
    }

    function handleOffline() {
      setIsOffline(true)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [checkRegisteredOrderWithRetry])

  return { isRegistered, isOffline: isOffline || isPending }
}
