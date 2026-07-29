"use client"

import { useCallback, useEffect, useId, useRef } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useRestaurant } from "@/hooks/useRestaurant"
import { printTicketViaOsDriver, OS_PRINT_STORAGE_KEY } from "@/lib/printer/osPrint"
import { logger } from "@/lib/logger"

const EN_PREPARACION_STATUS_ID = 2

type FetchedOrder = {
  id: number
  status_id: number
  table_id: number
  tables: { table_number: number | null } | null
  order_items: { product_quantity: number; product_name: string | null; variant_name: string | null }[]
}

function osPrintEnabledFromStorage() {
  try {
    return localStorage.getItem(OS_PRINT_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Listener global para impresión por cable/driver del sistema.
 *
 * /admin/printer mantiene su propio listener para mostrar logs y soportar la
 * vía Bluetooth. Este componente cubre el resto del panel admin, de modo que
 * los pedidos sigan imprimiéndose aunque el usuario esté en Productos,
 * Pedidos, Caja, etc.
 */
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
        .select("id, status_id, table_id, tables ( table_number ), order_items ( product_quantity, product_name, variant_name )")
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

      await printTicketViaOsDriver({
        restaurantName: current.restaurant_name ?? "Restaurante",
        tableNumber: data.tables?.table_number ?? data.table_id,
        orderId: data.id,
        items: data.order_items.map((item) => ({
          quantity: item.product_quantity,
          name: item.variant_name
            ? `${item.product_name ?? "Producto"} · ${item.variant_name}`
            : item.product_name ?? "Producto",
        })),
      })

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
