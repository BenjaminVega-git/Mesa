import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { useOfflineRetry, isNetworkError } from "@/hooks/useOfflineRetry"
import { handleMutationError } from "@/lib/hooks/handle-mutation-error"
import {
  listActiveOrdersAction,
  advanceOrderStatusAction,
  markOrderAsPaidAction,
  markTableOrdersAsPaidAction,
} from "@/app/actions/order-actions"
import { payDinerOrdersAction } from "@/app/actions/diner-actions"
import { playNewOrderSound } from "@/lib/notification-sound"
import {
  requestNotificationPermission,
  showOrderNotification,
} from "@/lib/order-notifications"
import type { WaiterOrder } from "@/services/order-service"

function orderItemSummary(item: WaiterOrder["items"][number]) {
  const base = `${item.productQuantity}x ${item.productName}${item.variantName ? ` - ${item.variantName}` : ""}`
  return item.notes ? `${base} (${item.notes})` : base
}

/**
 * Carga las órdenes activas del restaurante y se suscribe a cambios en
 * realtime (orders + order_items). Cualquier cambio dispara un re-fetch — más
 * simple y robusto que hacer merges manuales por evento.
 */
export function useWaiterOrders(restaurantId: number | null) {
  const [orders, setOrders] = useState<WaiterOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [advancingId, setAdvancingId] = useState<number | null>(null)

  const restaurantIdRef = useRef(restaurantId)
  useEffect(() => {
    restaurantIdRef.current = restaurantId
  }, [restaurantId])

  // Set de IDs ya vistos para detectar pedidos verdaderamente nuevos y
  // disparar el beep solo en ese caso (no en el fetch inicial ni cuando
  // re-fetcheamos por un cambio de status).
  const knownOrderIdsRef = useRef<Set<number>>(new Set())
  const initialLoadDoneRef = useRef(false)

  // Pedir permiso de notificaciones del sistema al montar. Si el usuario
  // lo rechaza, las notificaciones simplemente no aparecen — el sonido
  // sigue siendo el canal principal.
  useEffect(() => {
    requestNotificationPermission().catch(() => undefined)
  }, [])

  const fetchOrders = useCallback(async () => {
    const rid = restaurantIdRef.current
    if (!rid) return
    const result = await listActiveOrdersAction(rid)
    if (!result.ok) {
      setError(result.error)
      return
    }

    const incoming = result.data
    if (initialLoadDoneRef.current) {
      // Solo IDs nuevos que NO estaban antes y siguen en estado activo (1-3).
      const newlyArrived = incoming.filter(
        (o) => !knownOrderIdsRef.current.has(o.id) && o.statusId >= 1 && o.statusId <= 3
      )
      if (newlyArrived.length > 0) {
        playNewOrderSound()
        for (const o of newlyArrived) {
          const tableLabel = o.orderType === "delivery"
            ? `${o.fulfillmentType === "pickup" ? "Retiro en tienda" : "Domicilio"} · ${o.deliveryCustomerName ?? "Cliente"}`
            : o.tableNumber != null ? `Mesa ${o.tableNumber}` : `Mesa #${o.tableId ?? "?"}`
          const itemsSummary = o.items
            .slice(0, 3)
            .map(orderItemSummary)
            .join(", ")
          showOrderNotification({
            title: `Nuevo pedido — ${tableLabel}`,
            body: itemsSummary || `Pedido #${o.id}`,
            tag: `order-${o.id}`,
          })
        }
      }
    }
    knownOrderIdsRef.current = new Set(incoming.map((o) => o.id))
    initialLoadDoneRef.current = true

    setOrders(incoming)
    setError("")
  }, [])

  const fetchRetry = useOfflineRetry(fetchOrders)

  const reload = useCallback(async () => {
    try {
      await fetchRetry.run()
    } catch (err) {
      if (isNetworkError(err)) return
      logger.error("Error cargando órdenes", err)
    }
  }, [fetchRetry])

  useEffect(() => {
    if (!restaurantId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transición a estado idle cuando no hay restaurante.
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetchOrders()
      .catch((err) => {
        if (cancelled) return
        if (isNetworkError(err)) return
        logger.error("Error cargando órdenes (init)", err)
        setError("No se pudieron cargar las órdenes")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [restaurantId, fetchOrders])

  useEffect(() => {
    if (!restaurantId) return

    const refetch = () => {
      fetchOrders().catch(() => undefined)
    }

    const channel = supabase
      .channel(`waiter-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        refetch
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          logger.warn(`Realtime orders channel: ${status}`)
        }
      })

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch()
    }
    window.addEventListener("focus", refetch)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener("focus", refetch)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [restaurantId, fetchOrders])

  const advance = useCallback(
    async (orderId: number): Promise<boolean> => {
      if (advancingId) return false
      try {
        setAdvancingId(orderId)
        setError("")
        const result = await advanceOrderStatusAction(orderId)
        if (!result.ok) {
          setError(result.error)
          return false
        }
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== orderId) return o
            const next: WaiterOrder = { ...o, statusId: result.data.statusId }
            // Cuando recien pasa a Listo, congelamos readyAt localmente para
            // que el promedio no use el tiempo en vivo hasta que llegue el
            // evento Realtime con el valor real seteado por el trigger.
            if (result.data.statusId === 3 && !o.readyAt) {
              next.readyAt = new Date().toISOString()
            }
            return next
          })
        )
        return true
      } catch (err) {
        handleMutationError(err, {
          logTag: "Error avanzando orden",
          fallback: "Error al avanzar la orden",
          setError,
        })
        return false
      } finally {
        setAdvancingId(null)
      }
    },
    [advancingId]
  )

  const markPaid = useCallback(
    async (orderId: number): Promise<boolean> => {
      if (advancingId) return false
      try {
        setAdvancingId(orderId)
        setError("")
        const result = await markOrderAsPaidAction(orderId)
        if (!result.ok) {
          setError(result.error)
          return false
        }
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, statusId: result.data.statusId } : o))
        )
        return true
      } catch (err) {
        handleMutationError(err, {
          logTag: "Error marcando orden como pagada",
          fallback: "Error al marcar como pagada",
          setError,
        })
        return false
      } finally {
        setAdvancingId(null)
      }
    },
    [advancingId]
  )

  const [payingDinerKey, setPayingDinerKey] = useState<string | null>(null)
  const markDinerPaid = useCallback(
    async (tableId: number, dinerSlot: number): Promise<{ ok: boolean; paidCount: number; tableReleased: boolean }> => {
      const key = `${tableId}:${dinerSlot}`
      if (payingDinerKey != null) return { ok: false, paidCount: 0, tableReleased: false }
      try {
        setPayingDinerKey(key)
        setError("")
        const result = await payDinerOrdersAction(tableId, dinerSlot)
        if (!result.ok) {
          setError(result.error)
          return { ok: false, paidCount: 0, tableReleased: false }
        }
        const paidSet = new Set(result.data.paidIds)
        setOrders((prev) =>
          prev.map((o) => (paidSet.has(o.id) ? { ...o, statusId: 4 } : o))
        )
        return {
          ok: true,
          paidCount: result.data.paidIds.length,
          tableReleased: result.data.tableReleased,
        }
      } catch (err) {
        handleMutationError(err, {
          logTag: "Error pagando comensal",
          fallback: "Error al cobrar al comensal",
          setError,
        })
        return { ok: false, paidCount: 0, tableReleased: false }
      } finally {
        setPayingDinerKey(null)
      }
    },
    [payingDinerKey]
  )

  const [payingTableId, setPayingTableId] = useState<number | null>(null)
  const markTablePaid = useCallback(
    async (tableId: number, tip: number = 0): Promise<{ ok: boolean; paidCount: number }> => {
      if (payingTableId != null) return { ok: false, paidCount: 0 }
      try {
        setPayingTableId(tableId)
        setError("")
        const result = await markTableOrdersAsPaidAction(tableId, tip)
        if (!result.ok) {
          setError(result.error)
          return { ok: false, paidCount: 0 }
        }
        const paidSet = new Set(result.data.paidIds)
        setOrders((prev) =>
          prev.map((o) => (paidSet.has(o.id) ? { ...o, statusId: 4 } : o))
        )
        return { ok: true, paidCount: result.data.paidIds.length }
      } catch (err) {
        handleMutationError(err, {
          logTag: "Error pagando órdenes de mesa",
          fallback: "Error al pagar la mesa",
          setError,
        })
        return { ok: false, paidCount: 0 }
      } finally {
        setPayingTableId(null)
      }
    },
    [payingTableId]
  )

  return {
    orders,
    loading,
    error,
    advance,
    markPaid,
    markTablePaid,
    markDinerPaid,
    payingTableId,
    payingDinerKey,
    advancingId,
    reload,
  }
}
