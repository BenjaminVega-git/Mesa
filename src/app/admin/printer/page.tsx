"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRestaurant } from "@/hooks/useRestaurant"
import {
  buildOrderTicket,
  formatTicketAsText,
  getStoredTicketWidth,
  setStoredTicketWidth,
  TICKET_WIDTH_OPTIONS,
  type TicketInput,
} from "@/lib/printer/escpos"
import {
  isWebBluetoothAvailable,
  connectBluetoothPrinter,
  getKnownPrinter,
  sendTicket,
  printerLabel,
  onPrinterDisconnected,
  type ConnectedPrinter,
} from "@/lib/printer"
import {
  printTicketViaOsDriver,
  printTicketViaRawDriver,
  isElectronPrintAvailable,
  listElectronPrinters,
  getStoredElectronPrinter,
  setStoredElectronPrinter,
  OS_PRINT_STORAGE_KEY,
} from "@/lib/printer/osPrint"
import { logger } from "@/lib/logger"

type ElectronPrinterInfo = { name: string; displayName: string; isDefault: boolean }

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
  order_items: { product_quantity: number; product_name: string | null; variant_name: string | null; notes: string | null }[]
}

type LogEntry = {
  id: string
  orderId: number
  kind: "ok" | "error"
  message: string
  at: Date
  ticketInput?: TicketInput
}

function ticketItemName(item: FetchedOrder["order_items"][number]) {
  const base = item.variant_name
    ? `${item.product_name ?? "Producto"} · ${item.variant_name}`
    : item.product_name ?? "Producto"
  return item.notes ? `${base} - ${item.notes}` : base
}

const EN_PREPARACION_STATUS_ID = 2
const ORDER_FETCH_RETRY_DELAYS_MS = [0, 250, 700, 1500]
const MISSED_ORDER_RECOVERY_MS = 30_000
const REALTIME_RETRY_MS = 3_000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function PrinterPage() {
  const { restaurant, loading } = useRestaurant()
  const channelId = useId()
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [printer, setPrinter] = useState<ConnectedPrinter | null>(null)
  const [pairing, setPairing] = useState(false)
  const [pairError, setPairError] = useState<string | null>(null)
  const [osPrintEnabled, setOsPrintEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OS_PRINT_STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })
  const [ticketWidth, setTicketWidth] = useState<number>(() => getStoredTicketWidth())
  const ticketWidthRef = useRef(ticketWidth)
  const osPrintEnabledRef = useRef(osPrintEnabled)
  const [electronPrinters, setElectronPrinters] = useState<ElectronPrinterInfo[]>([])
  const [electronDevice, setElectronDevice] = useState<string>(() => getStoredElectronPrinter())
  const restaurantRef = useRef(restaurant)
  const listenerStartedAtRef = useRef(new Date().toISOString())
  const lastRestaurantIdRef = useRef<number | null>(null)
  const printerRef = useRef<ConnectedPrinter | null>(null)
  const reconnectingPrinter = useRef(false)
  const printedOrderIds = useRef<Set<number>>(new Set())
  const retryTimerRef = useRef<number | null>(null)
  // Un mismo pedido dispara más de un evento realtime casi al mismo tiempo:
  // create_public_order_qr/staff_create_order hacen INSERT (con el status ya
  // en "En preparación" si el destino es cocina directa) y después un UPDATE
  // en la MISMA transacción (fija el total ya calculado) — eso llega como dos
  // eventos separados. Sin un candado síncrono, ambos pasaban el chequeo de
  // "¿ya lo imprimí?" antes de que ninguno llegara a marcarlo (ese marcado
  // ocurría recién después de un await), y el ticket salía duplicado.
  const processingOrderIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    restaurantRef.current = restaurant
    if (restaurant?.id && lastRestaurantIdRef.current !== restaurant.id) {
      lastRestaurantIdRef.current = restaurant.id
      listenerStartedAtRef.current = new Date().toISOString()
      printedOrderIds.current.clear()
      processingOrderIds.current.clear()
    }
  }, [restaurant])

  useEffect(() => {
    printerRef.current = printer
  }, [printer])

  useEffect(() => {
    osPrintEnabledRef.current = osPrintEnabled
  }, [osPrintEnabled])

  useEffect(() => {
    ticketWidthRef.current = ticketWidth
  }, [ticketWidth])

  function watchPrinter(result: ConnectedPrinter) {
    printerRef.current = result
    setPrinter(result)
    onPrinterDisconnected(result, () => {
      // El navegador puede desconectar GATT después de varios minutos sin
      // tráfico. La autorización de Web Bluetooth sigue vigente, por lo que
      // podemos reconectar sin volver a abrir el selector.
      if (printerRef.current?.printer.device !== result.printer.device) return
      printerRef.current = null
      setPrinter(null)
      void reconnectKnownPrinter(500)
    })
  }

  async function reconnectKnownPrinter(delayMs = 0): Promise<ConnectedPrinter | null> {
    if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    if (reconnectingPrinter.current) return printerRef.current

    reconnectingPrinter.current = true
    try {
      const result = await getKnownPrinter()
      if (result) watchPrinter(result)
      return result
    } catch (err) {
      logger.warn("silent printer reconnect failed", { error: String(err) })
      return null
    } finally {
      reconnectingPrinter.current = false
    }
  }

  async function getReadyPrinter(): Promise<ConnectedPrinter | null> {
    const current = printerRef.current
    if (current?.printer.device.gatt?.connected) return current
    if (current) {
      printerRef.current = null
      setPrinter(null)
    }
    return reconnectKnownPrinter()
  }

  async function sendBluetoothTicket(data: Uint8Array): Promise<void> {
    const current = await getReadyPrinter()
    if (!current) throw new Error("Impresora no conectada")

    try {
      await sendTicket(current, data)
    } catch (err) {
      // Si GATT murió justo al comenzar el envío, recuperamos la conexión y
      // reintentamos una sola vez. Los errores con la conexión aún viva no se
      // repiten para evitar duplicar un ticket que sí pudo haber salido.
      if (current.printer.device.gatt?.connected) throw err
      const recovered = await reconnectKnownPrinter()
      if (!recovered) throw err
      await sendTicket(recovered, data)
    }
  }

  // Recupera automáticamente una impresora autorizada al abrir o recargar la
  // pantalla, sin exigir que el usuario la empareje otra vez.
  useEffect(() => {
    if (!restaurant?.id || restaurant.output_mode !== "printer" || !isWebBluetoothAvailable()) return
    void reconnectKnownPrinter()
  }, [restaurant?.id, restaurant?.output_mode])

  function handleTicketWidthChange(width: number) {
    setTicketWidth(width)
    setStoredTicketWidth(width)
  }

  // Solo existe dentro de la app de escritorio (window.electronAPI). Listamos
  // impresoras del sistema para mostrar nombres útiles, pero la vía cableada
  // imprime con diálogo porque algunos drivers térmicos imprimen blanco con
  // `webContents.print({ silent:true, deviceName })`.
  useEffect(() => {
    if (!isElectronPrintAvailable()) return
    listElectronPrinters().then(setElectronPrinters)
  }, [])

  // Bluetooth y "impresora del sistema" son EXCLUYENTES: activar una
  // desactiva la otra. Fue justamente convivir dos vías activas a la vez
  // (cable + esta) lo que causó tickets impresos por duplicado.
  function persistOsPrint(next: boolean) {
    try {
      localStorage.setItem(OS_PRINT_STORAGE_KEY, next ? "1" : "0")
    } catch {
      // no crítico
    }
  }

  function toggleOsPrint() {
    setOsPrintEnabled((prev) => {
      const next = !prev
      persistOsPrint(next)
      return next
    })
    if (!osPrintEnabled) setPrinter(null)
  }

  function appendEntry(partial: Omit<LogEntry, "id" | "at">) {
    setEntries((prev) => [
      { id: `${partial.orderId}-${performance.now()}`, at: new Date(), ...partial },
      ...prev.slice(0, 19),
    ])
  }

  const [testing, setTesting] = useState(false)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [manualPrintingOrderIds, setManualPrintingOrderIds] = useState<Set<number>>(new Set())

  function buildSampleTicket() {
    const current = restaurantRef.current
    return {
      restaurantName: current?.restaurant_name ?? "Restaurante",
      tableNumber: 1,
      orderId: 9999,
      items: [
        { quantity: 1, name: "Café con leche" },
        { quantity: 2, name: "Empanada de carne" },
        { quantity: 1, name: "Coca-Cola 500ml" },
      ],
    }
  }

  const fetchOrderForTicket = useCallback(async (orderId: number): Promise<FetchedOrder | null> => {
    let lastData: FetchedOrder | null = null
    let lastError: string | null = null

    for (const delayMs of ORDER_FETCH_RETRY_DELAYS_MS) {
      if (delayMs > 0) await wait(delayMs)

      const { data, error } = await supabase
        .from("orders")
        .select("id, status_id, table_id, order_type, fulfillment_type, delivery_customer_name, delivery_customer_phone, delivery_address, delivery_reference, tables ( table_number ), order_items ( product_quantity, product_name, variant_name, notes )")
        .eq("id", orderId)
        .maybeSingle<FetchedOrder>()

      if (error) {
        lastError = error.message
        continue
      }
      if (!data) {
        lastError = "data null"
        continue
      }

      lastData = data
      if (data.status_id !== EN_PREPARACION_STATUS_ID || data.order_items.length > 0) return data
    }

    if (lastError) throw new Error(lastError)
    return lastData
  }, [])

  function handlePreview() {
    setPreviewText(formatTicketAsText(buildSampleTicket()))
  }

  const printViaSystemDriver = useCallback(async (input: TicketInput): Promise<"raw" | "dialog"> => {
    try {
      if (await printTicketViaRawDriver(input)) return "raw"
    } catch (err) {
      logger.warn("raw cable print failed, usando diálogo", { error: String(err) })
    }
    await printTicketViaOsDriver(input)
    return "dialog"
  }, [])

  async function handleManualPrint(entry: LogEntry) {
    if (!entry.ticketInput || manualPrintingOrderIds.has(entry.orderId)) return

    const currentPrinter = await getReadyPrinter()
    if (!currentPrinter && !osPrintEnabledRef.current) {
      setEntries((prev) => prev.map((item) => item.id === entry.id
        ? { ...item, kind: "error", message: "Impresora no conectada. Conectala e intenta de nuevo." }
        : item
      ))
      return
    }

    setManualPrintingOrderIds((prev) => new Set(prev).add(entry.orderId))
    try {
      if (currentPrinter) {
        await sendBluetoothTicket(buildOrderTicket(entry.ticketInput, ticketWidthRef.current))
        setEntries((prev) => prev.map((item) => item.id === entry.id
          ? { ...item, kind: "ok", message: "Ticket reimpreso manualmente" }
          : item
        ))
      } else {
        const mode = await printViaSystemDriver(entry.ticketInput)
        setEntries((prev) => prev.map((item) => item.id === entry.id
          ? { ...item, kind: "ok", message: mode === "raw" ? "Ticket RAW reimpreso manualmente" : "Diálogo de impresión abierto" }
          : item
        ))
      }
    } catch (err) {
      logger.error("manual ticket print failed", { error: String(err), orderId: entry.orderId })
      setEntries((prev) => prev.map((item) => item.id === entry.id
        ? { ...item, kind: "error", message: err instanceof Error ? err.message : "No se pudo imprimir el ticket" }
        : item
      ))
    } finally {
      setManualPrintingOrderIds((prev) => {
        const next = new Set(prev)
        next.delete(entry.orderId)
        return next
      })
    }
  }

  async function handleTestPrint() {
    if (testing) return
    const current = restaurantRef.current
    const currentPrinter = await getReadyPrinter()
    if (!current || (!currentPrinter && !osPrintEnabled)) return

    setTesting(true)
    try {
      if (currentPrinter) {
        const ticket = buildOrderTicket(buildSampleTicket(), ticketWidth)
        await sendBluetoothTicket(ticket)
        appendEntry({ orderId: 9999, kind: "ok", message: "Ticket de prueba enviado", ticketInput: buildSampleTicket() })
      } else {
        const sampleTicket = buildSampleTicket()
        const mode = await printViaSystemDriver(sampleTicket)
        if (mode === "raw") {
          appendEntry({ orderId: 9999, kind: "ok", message: "Ticket RAW enviado en silencio", ticketInput: sampleTicket })
        } else {
          appendEntry({ orderId: 9999, kind: "ok", message: "Se abrió el diálogo de impresión del sistema", ticketInput: sampleTicket })
        }
      }
    } catch (err) {
      logger.error("test print failed", { error: String(err) })
      appendEntry({
        orderId: 9999,
        kind: "error",
        message: err instanceof Error ? err.message : "Error en impresión de prueba",
      })
    } finally {
      setTesting(false)
    }
  }

  async function handlePairBluetooth() {
    if (pairing) return
    setPairing(true)
    setPairError(null)
    try {
      const result = await connectBluetoothPrinter(restaurantRef.current?.printer_bluetooth_name ?? null)
      watchPrinter(result)
      // Excluyente con la vía del sistema — solo un método activo a la vez.
      if (osPrintEnabled) {
        setOsPrintEnabled(false)
        persistOsPrint(false)
      }
    } catch (err) {
      logger.error("printer pair failed", { error: String(err) })
      setPairError(err instanceof Error ? err.message : "No se pudo emparejar la impresora")
    } finally {
      setPairing(false)
    }
  }

  const handleOrderEvent = useCallback(async (orderId: number) => {
    const current = restaurantRef.current
    if (current?.output_mode !== "printer") return

    // Candado SÍNCRONO (sin ningún await antes de esto): si dos eventos del
    // mismo pedido llegan casi juntos, el segundo ve processingOrderIds ya
    // marcado por el primero y sale de inmediato — no hay ventana de carrera
    // posible entre "chequear" y "marcar" porque ambas cosas pasan en el
    // mismo tick de JS.
    if (printedOrderIds.current.has(orderId) || processingOrderIds.current.has(orderId)) return
    processingOrderIds.current.add(orderId)

    let ticketInput: TicketInput | undefined
    try {
      const data = await fetchOrderForTicket(orderId)

      if (!data) {
        appendEntry({
          orderId,
          kind: "error",
          message: "No se pudo leer el pedido: data null",
        })
        return
      }

      if (data.status_id !== EN_PREPARACION_STATUS_ID) return

      if (data.order_items.length === 0) {
        appendEntry({
          orderId,
          kind: "error",
          message: "El pedido todavía no tiene productos para imprimir. Intenta reimprimir desde pedidos.",
        })
        return
      }

      ticketInput = {
        restaurantName: current.restaurant_name ?? "Restaurante",
        tableNumber: data.tables?.table_number === 0 ? "Recepción" : data.tables?.table_number ?? data.table_id,
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
      } satisfies TicketInput

      // Actualizar preview con el ticket real (independiente de si imprime o no).
      setPreviewText(formatTicketAsText(ticketInput))

      const currentPrinter = await getReadyPrinter()
      if (!currentPrinter && !osPrintEnabledRef.current) {
        appendEntry({ orderId, kind: "error", message: "Impresora no conectada (ver vista previa)", ticketInput })
        return
      }

      if (currentPrinter) {
        const ticket = buildOrderTicket(ticketInput, ticketWidthRef.current)
        await sendBluetoothTicket(ticket)
        appendEntry({ orderId, kind: "ok", message: "Ticket impreso", ticketInput })
      } else {
        const mode = await printViaSystemDriver(ticketInput)
        if (mode === "raw") {
          appendEntry({ orderId, kind: "ok", message: "Ticket RAW enviado en silencio", ticketInput })
        } else {
          appendEntry({ orderId, kind: "ok", message: "Diálogo de impresión del sistema abierto", ticketInput })
        }
      }

      // Marcar impreso solo tras éxito real: si falló, otro evento posterior
      // del mismo pedido (o un reintento) todavía puede lograrlo.
      printedOrderIds.current.add(orderId)
    } catch (err) {
      logger.error("printer page error", { error: String(err) })
      appendEntry({
        orderId,
        kind: "error",
        message: err instanceof Error ? err.message : "Error inesperado",
        ticketInput,
      })
    } finally {
      processingOrderIds.current.delete(orderId)
    }
  }, [fetchOrderForTicket, printViaSystemDriver])

  const recoverMissedOrders = useCallback(async () => {
    const current = restaurantRef.current
    if (!current || current.output_mode !== "printer") return
    if (!printerRef.current && !osPrintEnabledRef.current) return

    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", current.id)
      .eq("status_id", EN_PREPARACION_STATUS_ID)
      .gte("created_at", listenerStartedAtRef.current)
      .order("created_at", { ascending: true })
      .limit(25)

    if (error) {
      logger.warn("printer page recovery query failed", { error: error.message })
      return
    }

    for (const row of data ?? []) {
      if (typeof row.id === "number") await handleOrderEvent(row.id)
    }
  }, [handleOrderEvent])

  useEffect(() => {
    if (!restaurant?.id) return
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
  }, [restaurant?.id, restaurant?.output_mode, recoverMissedOrders])

  useEffect(() => {
    if (!restaurant?.id) return

    let active = true
    const channel = supabase
      .channel(`printer-${restaurant.id}-${channelId}`)
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
        logger.warn(`Realtime printer channel: ${status}`)
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
  }, [restaurant?.id, channelId, handleOrderEvent, subscriptionAttempt])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 text-sm font-semibold text-stone-600">
        Cargando...
      </main>
    )
  }

  if (!restaurant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 text-center text-sm font-semibold text-stone-600">
        Sin restaurante. Iniciá sesión como admin.
      </main>
    )
  }

  const printerEnabled = restaurant.output_mode === "printer"
  const btSupported = isWebBluetoothAvailable()
  const isElectron = isElectronPrintAvailable()
  const connected = Boolean(printer) || osPrintEnabled
  const ready = printerEnabled && connected

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Impresora</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {restaurant.restaurant_name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Mantené esta pantalla abierta en el dispositivo del local con la impresora ya conectada.
          </p>
        </header>

        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`relative flex h-3 w-3 ${ready ? "" : "opacity-40"}`} aria-hidden="true">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
                  ready ? "bg-emerald-400" : "bg-stone-400"
                } opacity-75`}
              />
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  ready ? "bg-emerald-500" : "bg-stone-400"
                }`}
              />
            </span>
            <p className="text-sm font-bold text-stone-900">
              {ready
                ? "Listo para imprimir"
                : !printerEnabled
                ? "Elegí 'Impresora térmica' en /admin/settings"
                : "Falta conectar la impresora"}
            </p>
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-stone-500">Destino</dt>
              <dd className="mt-1 font-semibold">
                {restaurant.order_destination === "kitchen" ? "Cocina directa" : "Mesero"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-stone-500">Dispositivo</dt>
              <dd className="mt-1 font-semibold">
                {printer
                  ? printerLabel(printer)
                  : osPrintEnabled
                  ? isElectron && electronDevice
                    ? `${electronDevice} (RAW silencioso)`
                    : "Impresora del sistema (diálogo por ticket)"
                  : restaurant.printer_bluetooth_name ?? "—"}
              </dd>
            </div>
          </dl>

          {printerEnabled && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {btSupported && (
                <button
                  type="button"
                  onClick={handlePairBluetooth}
                  disabled={pairing}
                  className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pairing ? "Emparejando..." : printer ? "Reemparejar Bluetooth" : "Emparejar por Bluetooth"}
                </button>
              )}
              <button
                type="button"
                onClick={toggleOsPrint}
                title="Imprime con la impresora que ya tengas configurada en Windows/macOS. En la app de escritorio intentamos RAW silencioso; si no hay impresora elegida, se usa el diálogo."
                className={`rounded-xl px-5 py-3 text-sm font-bold shadow-sm transition ${
                  osPrintEnabled
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
                }`}
              >
                {osPrintEnabled ? "Impresora del sistema: activada" : "Usar impresora del sistema"}
              </button>
              {btSupported && (
                <select
                  value={ticketWidth}
                  onChange={(e) => handleTicketWidthChange(Number(e.target.value))}
                  title="Ancho del papel para tickets por Bluetooth (ESC/POS). La impresora del sistema se ajusta sola, esto solo aplica a la vía Bluetooth."
                  className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm font-bold text-stone-700 outline-none focus:border-orange-300"
                >
                  {TICKET_WIDTH_OPTIONS.map((o) => (
                    <option key={o.width} value={o.width}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {osPrintEnabled && isElectron && (
                <select
                  value={electronDevice}
                  onChange={(e) => {
                    setElectronDevice(e.target.value)
                    setStoredElectronPrinter(e.target.value)
                  }}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm font-bold text-stone-700 outline-none focus:border-orange-300"
                >
                  <option value="">Elegí en el diálogo al imprimir</option>
                  {electronPrinters.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.displayName || p.name}
                      {p.isDefault ? " (predeterminada)" : ""}
                    </option>
                  ))}
                </select>
              )}
              {connected && (
                <button
                  type="button"
                  onClick={handleTestPrint}
                  disabled={testing}
                  className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing ? "Imprimiendo..." : "Probar impresión"}
                </button>
              )}
              <button
                type="button"
                onClick={handlePreview}
                className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-800 shadow-sm transition hover:bg-stone-50"
              >
                Vista previa del ticket
              </button>
              {connected && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  Conectado
                </span>
              )}
            </div>
          )}

          {osPrintEnabled && !printer && (
            <p className="mt-3 text-[11px] text-stone-400">
              {isElectron && electronDevice
                ? `Cada pedido nuevo intentará imprimirse en silencio por RAW en "${electronDevice}". Si el driver no acepta RAW, se abrirá el diálogo como respaldo.`
                : isElectron
                ? "Elegí una impresora arriba para intentar RAW silencioso. Sin impresora elegida, se abrirá el diálogo."
                : "Cada pedido nuevo va a abrir el diálogo de impresión del sistema — elegí la impresora ahí (o dejá la que esté por defecto) y confirmá."}
            </p>
          )}

          {previewText && (
            <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Vista previa</p>
                <button
                  type="button"
                  onClick={() => setPreviewText(null)}
                  className="text-xs font-semibold text-stone-500 hover:text-stone-800"
                >
                  Cerrar
                </button>
              </div>
              <pre className="overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-stone-800">
{previewText}
              </pre>
            </div>
          )}

          {pairError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {pairError}
            </p>
          )}

          {!printerEnabled && (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              La salida actual no es impresora. Cambiala en <span className="font-mono">/admin/settings</span>.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">Últimos tickets</h2>
          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">Esperando pedidos en preparación…</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className={`flex items-start justify-between rounded-2xl border px-4 py-3 text-sm ${
                    entry.kind === "ok"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <div>
                    <p className={`font-bold ${entry.kind === "ok" ? "text-emerald-800" : "text-red-800"}`}>
                      Pedido #{entry.orderId}
                    </p>
                    <p className={`mt-0.5 text-xs ${entry.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>
                      {entry.message}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-3">
                    {entry.ticketInput && (
                      <button
                        type="button"
                        onClick={() => handleManualPrint(entry)}
                        disabled={manualPrintingOrderIds.has(entry.orderId)}
                        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 shadow-sm transition hover:border-orange-300 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {manualPrintingOrderIds.has(entry.orderId) ? "Imprimiendo…" : "Imprimir"}
                      </button>
                    )}
                    <time className="text-[11px] font-mono text-stone-500">
                      {entry.at.toLocaleTimeString("es-CL")}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
