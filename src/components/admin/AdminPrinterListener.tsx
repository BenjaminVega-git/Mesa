"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useRestaurant } from "@/hooks/useRestaurant"
import {
  printTicketViaOsDriver,
  printTicketViaRawDriver,
  OS_PRINT_STORAGE_KEY,
} from "@/lib/printer/osPrint"
import { logger } from "@/lib/logger"

const EN_PREPARACION_STATUS_ID = 2
const ORDER_FETCH_RETRY_DELAYS_MS = [0, 250, 700, 1500]
const MISSED_ORDER_RECOVERY_MS = 30_000
const REALTIME_RETRY_MS = 3_000

type FetchedOrder = {
  id: number
  status_id: number
  table_id: number
  order_type: "dine_in" | "delivery"
  fulfillment_type: "home_delivery" | "pickup" | null
  delivery_customer_name: string | null
  delivery_customer_phone: string | null
  delivery_address: string | null
  delivery_reference: string | null
  tables: { table_number: number | null } | null
  order_items: Array<{
    product_quantity: number
    product_name: string | null
    variant_name: string | null
    notes: string | null
  }>
}

function osPrintEnabledFromStorage() {
  try {
    return localStorage.getItem(OS_PRINT_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function ticketItemName(item: FetchedOrder["order_items"][number]) {
  const base = item.variant_name
    ? `${item.product_name ?? "Producto"} · ${item.variant_name}`
    : item.product_name ?? "Producto"
  return item.notes ? `${base} - ${item.notes}` : base
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function AdminPrinterListener() {
  const { restaurant } = useRestaurant()
  const pathname = usePathname()
  const channelId = useId()
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0)
  const restaurantRef = useRef(restaurant)
  const listenerStartedAtRef = useRef(new Date().toISOString())
  const lastRestaurantIdRef = useRef<number | null>(null)
  const printedOrderIds = useRef<Set<number>>(new Set())
  const processingOrderIds = useRef<Set<number>>(new Set())
  const retryTimerRef = useRef<number | null>(null)

  useEffect(() => {
    restaurantRef.current = restaurant
    if (restaurant?.id && lastRestaurantIdRef.current !== restaurant.id) {
      lastRestaurantIdRef.current = restaurant.id
      listenerStartedAtRef.current = new Date().toISOString()
      printedOrderIds.current.clear()
      processingOrderIds.current.clear()
    }
  }, [restaurant])

  const fetchOrderForTicket = useCallback(async (orderId: number): Promise<FetchedOrder | null> => {
    let lastData: FetchedOrder | null = null

    for (const delayMs of ORDER_FETCH_RETRY_DELAYS_MS) {
      if (delayMs > 0) await wait(delayMs)

      const { data, error } = await supabase
        .from("orders")
        .select("id, status_id, table_id, order_type, fulfillment_type, delivery_customer_name, delivery_customer_phone, delivery_address, delivery_reference, tables ( table_number ), order_items ( product_quantity, product_name, variant_name, notes )")
        .eq("id", orderId)
        .maybeSingle<FetchedOrder>()

      if (error || !data) continue

      lastData = data
      if (data.status_id !== EN_PREPARACION_STATUS_ID || data.order_items.length > 0) return data
    }

    return lastData
  }, [])

  const handleOrderEvent = useCallback(async (orderId: number) => {
    const current = restaurantRef.current
    if (!current || current.output_mode !== "printer") return
    if (printedOrderIds.current.has(orderId) || processingOrderIds.current.has(orderId)) return
    processingOrderIds.current.add(orderId)

    try {
      const data = await fetchOrderForTicket(orderId)

      if (!data) {
        logger.warn("global printer could not read order", {
          orderId,
          error: "data null",
        })
        return
      }

      if (data.status_id !== EN_PREPARACION_STATUS_ID) return
      if (data.order_items.length === 0) {
        logger.warn("global printer skipped empty order ticket", { orderId })
        return
      }

      const ticketInput = {
        restaurantName: current.restaurant_name ?? "Restaurante",
        tableNumber: data.tables?.table_number === 0 ? "Recepcion" : data.tables?.table_number ?? data.table_id,
        destinationLabel: data.order_type === "delivery"
          ? data.fulfillment_type === "pickup" ? "RETIRO EN TIENDA" : "DOMICILIO"
          : undefined,
        customerName: data.delivery_customer_name,
        customerPhone: data.delivery_customer_phone,
        deliveryAddress: data.delivery_address,
        deliveryReference: data.delivery_reference,
        orderId: data.id,
        items: data.order_items.map((item) => ({
          quantity: item.product_quantity,
          name: ticketItemName(item),
        })),
      }

      try {
        const printedRaw = await printTicketViaRawDriver(ticketInput)
        if (!printedRaw) await printTicketViaOsDriver(ticketInput)
      } catch (err) {
        logger.warn("global raw cable print failed, usando dialogo", { error: String(err) })
        await printTicketViaOsDriver(ticketInput)
      }

      printedOrderIds.current.add(orderId)
    } catch (err) {
      logger.error("global printer page error", err)
    } finally {
      processingOrderIds.current.delete(orderId)
    }
  }, [fetchOrderForTicket])

  const recoverMissedOrders = useCallback(async () => {
    const current = restaurantRef.current
    if (!current || current.output_mode !== "printer") return
    if (!osPrintEnabledFromStorage()) return
    if (pathname?.startsWith("/admin/printer")) return

    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", current.id)
      .eq("status_id", EN_PREPARACION_STATUS_ID)
      .gte("created_at", listenerStartedAtRef.current)
      .order("created_at", { ascending: true })
      .limit(25)

    if (error) {
      logger.warn("global printer recovery query failed", { error: error.message })
      return
    }

    for (const row of data ?? []) {
      if (typeof row.id === "number") await handleOrderEvent(row.id)
    }
  }, [handleOrderEvent, pathname])

  useEffect(() => {
    if (!restaurant?.id) return
    if (!osPrintEnabledFromStorage()) return
    if (pathname?.startsWith("/admin/printer")) return
    if (restaurant.output_mode !== "printer") return

    const interval = window.setInterval(() => {
      void recoverMissedOrders()
    }, MISSED_ORDER_RECOVERY_MS)
    const onWake = () => {
      void recoverMissedOrders()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void recoverMissedOrders()
    }

    window.addEventListener("focus", onWake)
    window.addEventListener("online", onWake)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", onWake)
      window.removeEventListener("online", onWake)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [restaurant?.id, restaurant?.output_mode, pathname, recoverMissedOrders])

  useEffect(() => {
    if (!restaurant?.id) return
    if (!osPrintEnabledFromStorage()) return
    if (pathname?.startsWith("/admin/printer")) return
    if (restaurant.output_mode !== "printer") return

    let active = true
    const channel = supabase
      .channel(`admin-printer-global-${restaurant.id}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        (payload) => {
          const id = (payload.new as { id?: number }).id
          if (typeof id === "number") handleOrderEvent(id)
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        (payload) => {
          const id = (payload.new as { id?: number }).id
          if (typeof id === "number") handleOrderEvent(id)
        }
      )
      .subscribe((status) => {
        if (!active) return
        if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return
        logger.warn(`Realtime admin-printer-global channel: ${status}`)
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null
          setSubscriptionAttempt((attempt) => attempt + 1)
        }, REALTIME_RETRY_MS)
      })

    return () => {
      active = false
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [restaurant?.id, restaurant?.output_mode, pathname, channelId, handleOrderEvent, subscriptionAttempt])

  return null
}
