"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRestaurant } from "@/hooks/useRestaurant"
import { logger } from "@/lib/logger"
import { KitchenGuard } from "@/components/KitchenGuard"
import { advanceOrderStatusAction } from "@/app/actions/order-actions"
import { playNewOrderSound } from "@/lib/notification-sound"

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
  created_at: string
  tables: { table_number: number | null } | null
  order_items: { product_quantity: number; product_name: string | null; variant_name: string | null; notes: string | null }[]
}

type DisplayOrder = {
  id: number
  tableNumber: number | string
  receivedAt: Date
  items: { quantity: number; name: string; notes: string | null }[]
  delivery: { fulfillmentType: "home_delivery" | "pickup"; name: string | null; phone: string | null; address: string | null; reference: string | null } | null
}

const EN_PREPARACION_STATUS_ID = 2

function formatClock(date: Date) {
  return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

function rowToDisplay(data: FetchedOrder): DisplayOrder {
  return {
    id: data.id,
    tableNumber: data.order_type === "delivery" ? (data.fulfillment_type === "pickup" ? "Retiro en tienda" : "Domicilio") : data.tables?.table_number ?? data.table_id,
    receivedAt: new Date(data.created_at),
    items: data.order_items.map((item) => ({
      quantity: item.product_quantity,
      name: item.variant_name
        ? `${item.product_name ?? "Producto"} · ${item.variant_name}`
        : item.product_name ?? "Producto",
      notes: item.notes,
    })),
    delivery: data.order_type === "delivery" ? {
      fulfillmentType: data.fulfillment_type === "pickup" ? "pickup" : "home_delivery",
      name: data.delivery_customer_name,
      phone: data.delivery_customer_phone,
      address: data.delivery_address,
      reference: data.delivery_reference,
    } : null,
  }
}

export default function ScreenPageWrapper() {
  return (
    <KitchenGuard>
      <ScreenPage />
    </KitchenGuard>
  )
}

function ScreenPage() {
  const { restaurant, loading } = useRestaurant()
  const channelId = useId()
  const [orders, setOrders] = useState<DisplayOrder[]>([])
  const [markingId, setMarkingId] = useState<number | null>(null)
  const restaurantRef = useRef(restaurant)
  const knownOrderIdsRef = useRef<Set<number>>(new Set())
  const initialLoadDoneRef = useRef(false)

  useEffect(() => {
    restaurantRef.current = restaurant
  }, [restaurant])

  const fetchOrder = useCallback(async (orderId: number): Promise<FetchedOrder | null> => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, status_id, table_id, created_at, order_type, fulfillment_type, delivery_customer_name, delivery_customer_phone, delivery_address, delivery_reference, tables ( table_number ), order_items ( product_quantity, product_name, variant_name, notes )"
      )
      .eq("id", orderId)
      .maybeSingle<FetchedOrder>()

    if (error || !data) return null
    return data
  }, [])

  const handleOrderEvent = useCallback(
    async (orderId: number, newStatus: number | null) => {
      const current = restaurantRef.current
      if (current?.output_mode !== "screen") return

      // Salió de "En preparación": quitar del listado si estaba.
      if (newStatus !== null && newStatus !== EN_PREPARACION_STATUS_ID) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId))
        return
      }

      // Entró o sigue en "En preparación": cargar detalle y agregar/actualizar.
      try {
        const data = await fetchOrder(orderId)
        if (!data || data.status_id !== EN_PREPARACION_STATUS_ID) return

        setOrders((prev) => {
          if (prev.some((o) => o.id === data.id)) return prev
          // Solo suena si es realmente nuevo (no en la lista inicial).
          if (initialLoadDoneRef.current && !knownOrderIdsRef.current.has(data.id)) {
            playNewOrderSound()
          }
          knownOrderIdsRef.current.add(data.id)
          return [rowToDisplay(data), ...prev].slice(0, 12)
        })
      } catch (err) {
        logger.error("screen page event", { error: String(err) })
      }
    },
    [fetchOrder]
  )

  // Fetch inicial: trae los pedidos que YA están en "En preparación" al abrir.
  useEffect(() => {
    if (!restaurant?.id) return
    if (restaurant.output_mode !== "screen") return

    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status_id, table_id, created_at, order_type, fulfillment_type, delivery_customer_name, delivery_customer_phone, delivery_address, delivery_reference, tables ( table_number ), order_items ( product_quantity, product_name, variant_name, notes )"
        )
        .eq("restaurant_id", restaurant.id)
        .eq("status_id", EN_PREPARACION_STATUS_ID)
        .order("created_at", { ascending: false })
        .limit(12)

      if (cancelled) return
      if (error) {
        logger.error("screen initial fetch", { error })
        return
      }
      const rows = (data ?? []) as unknown as FetchedOrder[]
      setOrders(rows.map(rowToDisplay))
      // Sembramos el set con los IDs iniciales para no hacer "ding" por ellos.
      knownOrderIdsRef.current = new Set(rows.map((r) => r.id))
      initialLoadDoneRef.current = true
    })()

    return () => {
      cancelled = true
    }
  }, [restaurant?.id, restaurant?.output_mode])

  // Realtime: INSERT y UPDATE de orders.
  useEffect(() => {
    if (!restaurant?.id) return

    const channel = supabase
      .channel(`screen-${restaurant.id}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        (payload) => {
          const row = payload.new as { id?: number; status_id?: number }
          if (typeof row.id !== "number") return
          handleOrderEvent(row.id, row.status_id ?? null)
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
          const row = payload.new as { id?: number; status_id?: number }
          if (typeof row.id !== "number") return
          handleOrderEvent(row.id, row.status_id ?? null)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant?.id, channelId, handleOrderEvent])

  async function handleMarkReady(orderId: number) {
    if (markingId) return
    setMarkingId(orderId)
    // Optimistic: quitar del listado de una vez.
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    try {
      const result = await advanceOrderStatusAction(orderId)
      if (!result.ok) {
        // Si falla, refetchear para reflejar el estado real.
        const data = await fetchOrder(orderId)
        if (data && data.status_id === EN_PREPARACION_STATUS_ID) {
          setOrders((prev) => {
            if (prev.some((o) => o.id === data.id)) return prev
            return [rowToDisplay(data), ...prev].slice(0, 12)
          })
        }
        logger.error("mark ready failed", { error: result.error })
      }
    } finally {
      setMarkingId(null)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-950 text-lg font-semibold text-stone-400">
        Cargando...
      </main>
    )
  }

  if (!restaurant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-950 px-6 text-center text-lg font-semibold text-stone-400">
        Sin restaurante. Iniciá sesión como admin.
      </main>
    )
  }

  const screenEnabled = restaurant.output_mode === "screen"

  return (
    <main className="min-h-screen bg-stone-950 px-8 py-8 text-white">
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-orange-400">Cocina</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{restaurant.restaurant_name}</h1>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Pedidos en preparación</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{orders.length}</p>
        </div>
      </header>

      {!screenEnabled && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200">
          La salida actual no es Pantalla. Cambiala en <span className="font-mono">/admin/settings</span> para que los
          pedidos aparezcan acá.
        </div>
      )}

      {orders.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center text-stone-500">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/5 text-3xl">⏳</div>
          <p className="mt-4 text-lg font-semibold">Esperando pedidos...</p>
          <p className="mt-1 text-sm text-stone-600">Los pedidos aparecen apenas entran en preparación.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((order) => (
            <article
              key={order.id}
              className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">
                    {order.delivery ? (order.delivery.fulfillmentType === "pickup" ? "Retiro en tienda" : "Domicilio") : `Mesa ${order.tableNumber}`}
                  </p>
                  <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">#{order.id}</p>
                </div>
                <span className="rounded-full bg-orange-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-200 ring-1 ring-orange-500/40">
                  {formatClock(order.receivedAt)}
                </span>
              </div>

              {order.delivery ? (
                <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs leading-5 text-orange-100">
                  <p className="font-bold">{order.delivery.name ?? "Cliente"} · {order.delivery.phone ?? "Sin teléfono"}</p>
                  {order.delivery.fulfillmentType === "home_delivery" ? <p>{order.delivery.address ?? "Sin dirección"}</p> : null}
                  {order.delivery.reference ? <p className="text-orange-200/75">{order.delivery.reference}</p> : null}
                </div>
              ) : null}

              <ul className="mt-4 space-y-2">
                {order.items.map((item, idx) => (
                  <li
                    key={`${order.id}-${idx}`}
                    className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/20 text-sm font-extrabold text-orange-200 tabular-nums">
                      {item.quantity}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{item.name}</span>
                      {item.notes ? (
                        <span className="mt-0.5 block line-clamp-2 text-[11px] font-medium leading-4 text-orange-100/80">
                          {item.notes}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleMarkReady(order.id)}
                disabled={markingId === order.id}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {markingId === order.id ? (
                  "Marcando..."
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Marcar listo
                  </>
                )}
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
