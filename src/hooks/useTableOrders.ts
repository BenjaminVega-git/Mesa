import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

export type TableOrderItem = {
  id: number
  productName: string
  variantName: string | null
  productPrice: number
  productQuantity: number
  notes: string | null
}

export type TableOrder = {
  id: number
  total: number
  statusId: number | null
  statusName: string | null
  createdAt: string
  readyAt: string | null
  dinerSlot: number | null
  dinerLabel: string | null
  items: TableOrderItem[]
}

type OrderRow = {
  id: number
  total: number
  status_id: number | null
  created_at: string
  ready_at: string | null
  diner_slot: number | null
  diner_label: string | null
  order_status: { status_name: string | null } | { status_name: string | null }[] | null
  order_items: Array<{
    id: number
    product_name: string | null
    variant_name: string | null
    product_price: number | null
    product_quantity: number
    notes: string | null
  }> | null
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

const TERMINAL_STATUS_NAMES = new Set(["pagado", "pagada", "cancelado", "cancelada"])

function isOrderActive(statusName: string | null) {
  if (!statusName) return true
  return !TERMINAL_STATUS_NAMES.has(normalize(statusName))
}

function pickStatusName(orderStatus: OrderRow["order_status"]) {
  if (!orderStatus) return null
  if (Array.isArray(orderStatus)) return orderStatus[0]?.status_name ?? null
  return orderStatus.status_name ?? null
}

function mapRow(row: OrderRow): TableOrder {
  return {
    id: row.id,
    total: row.total,
    statusId: row.status_id,
    statusName: pickStatusName(row.order_status),
    createdAt: row.created_at,
    readyAt: row.ready_at,
    dinerSlot: row.diner_slot ?? null,
    dinerLabel: row.diner_label ?? null,
    items: (row.order_items ?? []).map((it) => ({
      id: it.id,
      productName: it.product_name ?? "",
      variantName: it.variant_name,
      productPrice: Number(it.product_price ?? 0),
      productQuantity: it.product_quantity,
      notes: it.notes,
    })),
  }
}

// Polling adaptativo: parte rápido y se va espaciando si no hay cambios.
// Cuando llega algo nuevo, vuelve a la frecuencia mínima.
const MIN_INTERVAL_MS = 3_000   // hay actividad reciente -> consulta seguido
const MAX_INTERVAL_MS = 30_000  // sin cambios -> espacia hasta 30s
const BACKOFF_FACTOR = 1.5      // cuánto crece el intervalo cada vez sin cambios

// Huella simple del estado de los pedidos, para detectar si hubo cambios
// entre dos consultas (ids + estado + nº de items).
function ordersFingerprint(orders: TableOrder[]): string {
  return orders
    .map((o) => `${o.id}:${o.statusId}:${o.items.length}`)
    .join("|")
}

export function useTableOrders(qrCode: string | null) {
  const [orders, setOrders] = useState<TableOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Mutables que no deben re-disparar efectos.
  const lastFingerprintRef = useRef<string>("")
  const intervalMsRef = useRef<number>(MIN_INTERVAL_MS)
  const timeoutRef = useRef<number | null>(null)

  const fetchOrders = useCallback(async () => {
    if (!qrCode) {
      setOrders([])
      return
    }
    setIsLoading(true)
    try {
      // RPC SECURITY DEFINER: el cliente público (anon) no tiene SELECT directo
      // sobre orders/order_items; la función resuelve la mesa por el token del
      // QR y solo devuelve los pedidos de esa mesa.
      const { data, error } = await supabase.rpc("get_orders_for_table_qr", {
        p_qr_token: qrCode,
      })
      if (error) throw error
      const rows = (data ?? []) as unknown as OrderRow[]
      const active = rows.map(mapRow).filter((o) => isOrderActive(o.statusName))

      // ¿Cambió algo respecto a la última consulta? Ajusta el ritmo del polling.
      const fp = ordersFingerprint(active)
      if (fp !== lastFingerprintRef.current) {
        lastFingerprintRef.current = fp
        intervalMsRef.current = MIN_INTERVAL_MS // hubo cambio -> volver a consultar seguido
      } else {
        intervalMsRef.current = Math.min(
          Math.round(intervalMsRef.current * BACKOFF_FACTOR),
          MAX_INTERVAL_MS
        )
      }

      setOrders(active)
    } catch (err) {
      logger.error("Error cargando pedidos de la mesa", err)
    } finally {
      setIsLoading(false)
    }
  }, [qrCode])

  // Carga inicial al montar / cambiar de mesa.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de pedidos al montar
    fetchOrders()
  }, [fetchOrders])

  // Polling adaptativo con setTimeout encadenado (no setInterval), para poder
  // ajustar el delay entre cada vuelta según haya o no cambios.
  //
  // El cliente público (anon) no recibe eventos de postgres_changes sobre
  // orders (la RLS de realtime lo bloquea), por eso usamos polling. Si la
  // pestaña no está visible, se pausa del todo y se reanuda al volver.
  useEffect(() => {
    if (!qrCode) return

    let cancelled = false

    const scheduleNext = () => {
      if (cancelled) return
      timeoutRef.current = window.setTimeout(async () => {
        if (cancelled) return
        if (document.visibilityState === "visible") {
          await fetchOrders()
        }
        scheduleNext()
      }, intervalMsRef.current)
    }

    // Al volver a la pestaña: refrescar de inmediato y reiniciar al ritmo rápido.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        intervalMsRef.current = MIN_INTERVAL_MS
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        fetchOrders()
        scheduleNext()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    scheduleNext()

    return () => {
      cancelled = true
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [qrCode, fetchOrders])

  return { orders, isLoading, refresh: fetchOrders }
}
