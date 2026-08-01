"use client"

import { useCallback, useEffect, useId, useRef } from "react"
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

export function AdminPrinterListener() {
  const { restaurant } = useRestaurant()
  const pathname = usePathname()
  const channelId = useId()
  const restaurantRef = useRef(restaurant)
  const printedOrderIds = useRef<Set<number>>(new Set())
  const processingOrderIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    restaurantRef.current = restaurant
  }, [restaurant])

  const handleOrderEvent = useCallback(async (orderId: number) => {
    const current = restaurantRef.current
    if (!current || current.output_mode !== "printer") return
    if (printedOrderIds.current.has(orderId) || processingOrderIds.current.has(orderId)) return
    processingOrderIds.current.add(orderId)

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status_id, table_id, order_type, fulfillment_type, delivery_customer_name, delivery_customer_phone, delivery_address, delivery_reference, tables ( table_number ), order_items ( product_quantity, product_name, variant_name, notes )")
        .eq("id", orderId)
        .maybeSingle<FetchedOrder>()

      if (error || !data) {
        logger.warn("global printer could not read order", {
          orderId,
          error: error?.message ?? "data null",
        })
        return
      }

      if (data.status_id !== EN_PREPARACION_STATUS_ID) return

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
  }, [])

  useEffect(() => {
    if (!restaurant?.id) return
    if (!osPrintEnabledFromStorage()) return
    if (pathname?.startsWith("/admin/printer")) return
    if (restaurant.output_mode !== "printer") return

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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant?.id, restaurant?.output_mode, pathname, channelId, handleOrderEvent])

  return null
}
