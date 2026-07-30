"use client"

import React, { Suspense, useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, ChefHat, BellRing, Wallet } from "lucide-react"
import { isAdminRole } from "@/lib/waiter-session"
import { DeepLinkSetupNotice } from "@/components/DeepLinkSetupNotice"
import { ScanQrButton } from "@/components/ScanQrButton"
import { PayTableSection } from "@/components/waiter/PayTableSection"
import { ChargeDialog, type ChargeTarget } from "@/components/charge/ChargeDialog"
import { TakeOrderPanel } from "@/components/pos/TakeOrderPanel"
import { useGatewayProvider } from "@/hooks/useGatewayProvider"
import { useStaffProfile } from "@/hooks/useStaffProfile"
import { useWaiterOrders } from "@/hooks/useWaiterOrders"
import { useWaiters } from "@/hooks/useWaiters"
import { useServiceCalls } from "@/hooks/useServiceCalls"
import { useRestaurantTables } from "@/hooks/useRestaurantTables"
import { usePushRegistration } from "@/hooks/usePushRegistration"
import { reassignTableAction, claimTableAction } from "@/app/actions/order-actions"
import { supabase } from "@/lib/supabase"
import type { WaiterOrder } from "@/services/order-service"

const STATUS_NUEVO = 1
const STATUS_PREPARANDO = 2
const STATUS_LISTO = 3

const STATUS_LABEL: Record<number, string> = {
  [STATUS_NUEVO]: "Nuevo",
  [STATUS_PREPARANDO]: "Preparando",
  [STATUS_LISTO]: "Listo",
}

const STATUS_STYLE: Record<number, { dot: string; bg: string; glow: string }> = {
  [STATUS_NUEVO]: {
    dot: "bg-orange-500 shadow-orange-500/50",
    bg: "bg-orange-50 text-orange-700 border-orange-200/50",
    glow: "rgba(249, 115, 22, 0.2)",
  },
  [STATUS_PREPARANDO]: {
    dot: "bg-stone-800 shadow-stone-800/40",
    bg: "bg-stone-50 text-stone-700 border-stone-200",
    glow: "rgba(28, 25, 23, 0.1)",
  },
  [STATUS_LISTO]: {
    dot: "bg-emerald-500 shadow-emerald-500/50",
    bg: "bg-emerald-50 text-emerald-800 border-emerald-200/60",
    glow: "rgba(16, 185, 129, 0.25)",
  },
}

function parseDbTimestamp(iso: string | null): number | null {
  if (!iso) return null
  // La columna en DB puede ser `timestamp without time zone` y Postgres la guarda
  // en UTC. Si el string viene sin "Z" ni offset, JS lo parsea como hora local
  // del navegador. Forzamos UTC añadiendo "Z" cuando falta.
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  const ms = new Date(normalized).getTime()
  return Number.isNaN(ms) ? null : ms
}

function elapsedMinutes(
  order: { createdAt: string | null; readyAt: string | null },
  nowMs: number = Date.now()
): number {
  const start = parseDbTimestamp(order.createdAt)
  if (start == null) return 0
  const endIso = order.readyAt
  const end = endIso ? parseDbTimestamp(endIso) ?? nowMs : nowMs
  return Math.max(0, Math.floor((end - start) / 60000))
}

function tableLabel(o: WaiterOrder): string {
  if (o.tableNumber === 0) return "Recepción"
  if (o.tableNumber != null) return `Mesa ${o.tableNumber}`
  if (o.tableId != null) return `Mesa #${o.tableId}`
  return "Sin mesa"
}

export default function WaiterControlPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-stone-600">
          Cargando...
        </div>
      }
    >
      <WaiterControlSystem />
    </Suspense>
  )
}

function WaiterControlSystem() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusTableId = (() => {
    const raw = searchParams.get("tableId")
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  })()
  const focusTableNumber = searchParams.get("tableNumber") || null
  const { profile: loggedInStaff, loading: profileLoading } = useStaffProfile()

  const restaurantId = loggedInStaff?.restaurantId ?? null
  const staffId = loggedInStaff?.id ?? null

  // Registra el token FCM del dispositivo una vez que el mesero está logueado.
  usePushRegistration(staffId != null)
  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    advance,
    advancingId,
  } = useWaiterOrders(restaurantId)
  // Pasarela conectada (o null) para ofrecer "QR de pago" en el cobro.
  const gatewayProvider = useGatewayProvider()
  // Cobro de un pedido puntual ("Marcar pagado"): abre el mismo diálogo de
  // cobro que la mesa/comensal, con alcance por pedido.
  const [orderChargeTarget, setOrderChargeTarget] = useState<ChargeTarget | null>(null)
  // Toma de pedidos (POS): la misma carta del menú QR.
  const [posOpen, setPosOpen] = useState(false)
  const { tables: allTables, refresh: refreshTables } = useRestaurantTables(restaurantId)
  const { calls: serviceCalls, attend: attendServiceCall } = useServiceCalls(restaurantId)
  // Nota: useWaiters() lee el restaurantId internamente (useRestaurantId), no
  // recibe argumentos; pasarle uno rompería el tipado.
  const { waiters } = useWaiters()

  // Derivamos del listado global: mías, libres y ocupadas por otros.
  const assignedTables = useMemo(
    () => allTables.filter((t) => staffId != null && t.currentWaiterId === staffId),
    [allTables, staffId]
  )
  const availableTables = useMemo(
    () => allTables.filter((t) => t.currentWaiterId == null),
    [allTables]
  )
  const occupiedByOthers = useMemo(
    () =>
      allTables.filter(
        (t) => t.currentWaiterId != null && t.currentWaiterId !== staffId
      ),
    [allTables, staffId]
  )

  const assignedTableIds = useMemo(
    () => new Set(assignedTables.map((t) => t.id)),
    [assignedTables]
  )

  // Meseros a los que se puede transferir: solo rol mesero (roleId === 1) y
  // distintos al actual (excluye cocina/caja/admin y a uno mismo).
  const otherWaiters = useMemo(
    () => waiters.filter((w) => w.roleId === 1 && w.id !== staffId),
    [waiters, staffId]
  )

  const [selectedOrder, setSelectedOrder] = useState<WaiterOrder | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [transferTableId, setTransferTableId] = useState<number | null>(null)
  const [transferBusy, setTransferBusy] = useState(false)

  // Tick para refrescar los "minutos transcurridos" cada 30s.
  // Exponemos `nowMs` para que useMemo del promedio recompute con el tick.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }, [])

  const handleTableClick = useCallback(
    (tableId: number, tableNumber: string | number | null) => {
      if (focusTableId === tableId) {
        router.replace("/waiter/control")
      } else {
        const numParam = tableNumber != null ? `&tableNumber=${tableNumber}` : ""
        router.replace(`/waiter/control?tableId=${tableId}${numParam}`)
      }
    },
    [focusTableId, router]
  )

  useEffect(() => {
    if (profileLoading) return
    if (!loggedInStaff) {
      router.replace("/waiter/login")
      return
    }
    // Acceso cruzado: si un admin entra a esta URL, lo mandamos al login de
    // mesero sin cerrar su sesión. Si decide loguearse como mesero, ese signIn
    // reemplaza su sesión; si vuelve a /admin sigue logueado como admin.
    if (isAdminRole(loggedInStaff.role)) {
      router.replace("/waiter/login")
    }
  }, [profileLoading, loggedInStaff, router])

  // Reacciona si la sesión cambia desde otra pestaña (login/logout en otro lado).
  useEffect(() => {
    // Solo redirigir en logout explicito (ver nota en AdminGuard).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") router.replace("/waiter/login")
      }
    )
    return () => subscription.unsubscribe()
  }, [router])


  const handleAdvance = useCallback(
    async (order: WaiterOrder) => {
      const ok = await advance(order.id)
      if (!ok) return
      const next = order.statusId + 1
      if (next === STATUS_PREPARANDO)
        triggerToast(`Pedido #${order.id} en preparación 🍳`)
      else if (next === STATUS_LISTO)
        triggerToast(`¡Pedido #${order.id} listo para servir! 🛎️`)
    },
    [advance, triggerToast]
  )

  const handleMarkPaid = useCallback((order: WaiterOrder) => {
    if (order.tableId == null) return
    const tableLabel =
      order.tableNumber === 0
        ? "Recepción"
        : order.tableNumber != null
          ? `Mesa ${order.tableNumber}`
          : `Mesa #${order.tableId}`
    setOrderChargeTarget({
      scope: { tableId: order.tableId, orderId: order.id },
      label: `Pedido #${order.id} · ${tableLabel}`,
      total: order.total,
      ordersCount: 1,
    })
  }, [])

  const handleAttendCall = useCallback(
    async (callId: number, tableLabel: string) => {
      const ok = await attendServiceCall(callId, staffId)
      if (!ok) return
      triggerToast(`Cuenta de ${tableLabel} atendida 🧾`)
    },
    [attendServiceCall, staffId, triggerToast]
  )

  const [claimingTableId, setClaimingTableId] = useState<number | null>(null)

  const handleClaimTable = useCallback(
    async (tableId: number, tableNumber: number | null) => {
      setClaimingTableId(tableId)
      const res = await claimTableAction(tableId)
      setClaimingTableId(null)
      if (!res.ok) {
        triggerToast(res.error || "No se pudo tomar la mesa")
        return
      }
      if (!res.data.claimed) {
        triggerToast("Otro mesero la tomó justo antes")
        refreshTables()
        return
      }
      triggerToast(`Mesa ${tableNumber ?? tableId} asignada a ti ✓`)
      refreshTables()
    },
    [triggerToast, refreshTables]
  )

  const handleTransfer = useCallback(
    async (tableId: number, newWaiterId: number, waiterName: string) => {
      setTransferBusy(true)
      const res = await reassignTableAction(tableId, newWaiterId)
      setTransferBusy(false)
      if (!res.ok) {
        triggerToast(res.error || "No se pudo transferir la mesa")
        return
      }
      setTransferTableId(null)
      triggerToast(`Mesa transferida a ${waiterName} ✓`)
      // Refresco suave: revalida el listado de mesas sin recargar la página.
      // (El hook ya escucha realtime, pero forzamos el fetch para feedback inmediato.)
      refreshTables()
    },
    [triggerToast, refreshTables]
  )

  // Mesero ve pedidos de TODAS las mesas que tiene asignadas, no solo la
  // ultima escaneada. La mesa escaneada (focusTableId) solo sirve para
  // resaltar/identificar en la UI; no restringe la lista.
  const ownOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.tableNumber === 0 || (o.tableId != null && assignedTableIds.has(o.tableId))
      ),
    [orders, assignedTableIds]
  )

  const filteredOrders = useMemo(
    () =>
      ownOrders.filter((o) => {
        // Las Pagadas no se listan.
        if (o.statusId === 4) return false
        if (focusTableId != null && o.tableId !== focusTableId) return false
        return true
      }),
    [ownOrders, focusTableId]
  )

  const liveOrdersCount = ownOrders.filter((o) => o.statusId !== 4).length

  if (profileLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-stone-600">
        Cargando...
      </div>
    )
  }

  if (!loggedInStaff) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-stone-600">
        Redirigiendo al login de mesero...
      </div>
    )
  }

  return (
    <div className="pb-20 font-sans text-stone-900 selection:bg-orange-100 selection:text-orange-900">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-card-entrance rounded-2xl border border-stone-200/80 bg-white/95 px-5 py-4 shadow-2xl shadow-stone-900/10 backdrop-blur-xl flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-orange-500 animate-ping" />
          <p className="text-sm font-semibold text-stone-800">{toastMessage}</p>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-orange-600 uppercase">Sistema de Control Operativo</span>
            <h1 className="text-xl font-bold tracking-tight text-stone-950">Pedidos en vivo</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPosOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tomar pedido
            </button>
            <ScanQrButton onError={triggerToast} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl mt-8">
        <DeepLinkSetupNotice />

        {serviceCalls.length > 0 && (
          <section className="mb-6 space-y-2.5">
            {serviceCalls.map((call) => {
              const callTableLabel =
                call.tableNumber != null ? `Mesa ${call.tableNumber}` : `Mesa #${call.tableId}`
              const minutes = Math.max(
                0,
                Math.floor((nowMs - new Date(call.createdAt).getTime()) / 60000)
              )
              return (
                <div
                  key={call.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-orange-300/70 bg-orange-50 px-4 py-3 shadow-sm animate-card-entrance"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-900">
                        {call.callType === "waiter"
                          ? `🙋 ${callTableLabel} llama al mesero`
                          : `🧾 ${callTableLabel} pide la cuenta`}
                      </p>
                      {call.callType === "bill" && call.tip != null && call.tip > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                          Propina sugerida: ${call.tip.toLocaleString("es-CL")}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs font-semibold text-stone-500">
                        {call.dinerLabel ? <>{call.dinerLabel} · </> : null}
                        <span className="text-stone-400 tabular-nums">
                          {minutes < 1 ? "recién" : `hace ${minutes} min`}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAttendCall(call.id, callTableLabel)}
                    className="shrink-0 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-stone-700 active:scale-95"
                  >
                    Atendida ✓
                  </button>
                </div>
              )
            })}
          </section>
        )}

        {ordersError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {ordersError}
          </div>
        )}

        {focusTableId != null && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-orange-200/70 bg-orange-50/80 px-4 py-3 animate-card-entrance shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white text-sm font-bold shadow-md shadow-orange-500/20">
                {focusTableNumber || `#${focusTableId}`}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-700">
                  Filtro activo
                </p>
                <p className="text-sm font-semibold text-stone-800">
                  Mostrando solo pedidos de{" "}
                  {focusTableNumber ? `Mesa ${focusTableNumber}` : `Mesa #${focusTableId}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.replace("/waiter/control")}
              className="rounded-full bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 px-3.5 py-1.5 text-xs font-bold shadow-sm transition border border-stone-200 hover:border-stone-300 cursor-pointer active:scale-95 shrink-0"
            >
              Ver todas las mesas
            </button>
          </div>
        )}

        <section className="mb-8 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-stone-900">Mesas del restaurante</h2>
              <p className="text-[11px] text-stone-500">Monitoreo en vivo. Haz clic en una de tus mesas para filtrar sus pedidos.</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
              {assignedTables.length} tuya{assignedTables.length === 1 ? "" : "s"} · {availableTables.length} libre{availableTables.length === 1 ? "" : "s"} · {occupiedByOthers.length} ocupada{occupiedByOthers.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Leyenda de Colores Explicativa */}
          <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs bg-stone-50/50 rounded-xl p-3 border border-stone-100">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse" />
              <span className="font-semibold text-stone-700">Mesa disponible</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b] animate-pulse" style={{ animationDuration: "1.8s" }} />
              <span className="font-semibold text-stone-700">Atendida por ti</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" />
              <span className="font-semibold text-stone-700">Atendida por otro</span>
            </div>
          </div>

          {/* Listado Unificado y Animado de Mesas */}
          {allTables.length === 0 ? (
            <p className="text-xs text-stone-400 italic py-2">No hay mesas registradas en este restaurante.</p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {allTables.map((t) => {
                const isMine = staffId != null && t.currentWaiterId === staffId
                const isAvailable = t.currentWaiterId == null
                const isFocused = focusTableId === t.id

                if (isAvailable) {
                  const isClaiming = claimingTableId === t.id
                  return (
                    <div key={t.id} className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleTableClick(t.id, t.tableNumber)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95 shadow-sm ${
                          isFocused
                            ? "border-emerald-500 bg-emerald-100/80 text-emerald-900 ring-2 ring-offset-2 ring-emerald-500/70"
                            : "border-emerald-200/80 bg-emerald-50/70 hover:bg-emerald-50 text-emerald-800 hover:border-emerald-300"
                        }`}
                        title="Mesa disponible - Haz clic para filtrar"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]" />
                        Mesa {t.tableNumber ?? `#${t.id}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClaimTable(t.id, t.tableNumber)}
                        disabled={isClaiming}
                        className="rounded-full border border-emerald-200/80 bg-white px-2 py-1 text-[10px] font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Tomar esta mesa sin escanear el QR"
                      >
                        {isClaiming ? "..." : "Tomar"}
                      </button>
                    </div>
                  )
                } else if (isMine) {
                  const isTransferOpen = transferTableId === t.id
                  return (
                    <div key={t.id} className="relative inline-flex items-center gap-1">
                      <button
                        onClick={() => handleTableClick(t.id, t.tableNumber)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95 shadow-sm ${
                          isFocused
                            ? "border-amber-500 bg-amber-100 text-amber-900 ring-2 ring-offset-2 ring-amber-500/70"
                            : "border-amber-200/80 bg-amber-50/70 hover:bg-amber-50 text-amber-800 hover:border-amber-300"
                        }`}
                        title="Mesa atendida por ti - Haz clic para filtrar"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_#f59e0b] animate-ping absolute" style={{ width: "6px", height: "6px" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_#f59e0b] relative" />
                        Mesa {t.tableNumber ?? `#${t.id}`}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTransferTableId(isTransferOpen ? null : t.id)
                        }
                        className={`rounded-full border px-2 py-1 text-[10px] font-bold transition cursor-pointer active:scale-95 shadow-sm ${
                          isTransferOpen
                            ? "border-amber-500 bg-amber-100 text-amber-900"
                            : "border-amber-200/80 bg-white text-amber-700 hover:bg-amber-50 hover:border-amber-300"
                        }`}
                        title="Transferir esta mesa a otro mesero"
                        aria-expanded={isTransferOpen}
                      >
                        Transferir
                      </button>
                      {isTransferOpen && (
                        <div className="absolute left-0 top-full z-40 mt-2 w-56 rounded-2xl border border-stone-200/80 bg-white p-2 shadow-2xl shadow-stone-900/10 backdrop-blur-xl animate-card-entrance">
                          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                            Transferir Mesa {t.tableNumber ?? `#${t.id}`}
                          </p>
                          {otherWaiters.length === 0 ? (
                            <p className="px-2 py-2 text-xs font-medium text-stone-500 italic">
                              No hay otros meseros disponibles
                            </p>
                          ) : (
                            <div className="mt-1 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                              {otherWaiters.map((w) => (
                                <button
                                  key={w.id}
                                  type="button"
                                  disabled={transferBusy}
                                  onClick={() => handleTransfer(t.id, w.id, w.name)}
                                  className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-stone-700 transition hover:bg-amber-50 disabled:opacity-50 cursor-pointer"
                                >
                                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">
                                    {w.name.substring(0, 2).toUpperCase()}
                                  </span>
                                  <span className="truncate">{w.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                } else {
                  return (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-200/80 bg-red-50/70 px-3 py-1.5 text-[11px] font-bold text-red-800 shadow-sm cursor-default opacity-80"
                      title="Mesa atendida por otro mesero"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_3px_#ef4444]" />
                      Mesa {t.tableNumber ?? `#${t.id}`}
                    </span>
                  )
                }
              })}
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mb-8">
          <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Pedidos activos</p>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-extrabold tracking-tight text-stone-950">{liveOrdersCount}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-orange-50 text-orange-700">En curso</span>
            </div>
            <p className="text-xs text-stone-500 mt-2">Nuevos, en preparación o listos</p>
          </div>

          <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Listos para servir</p>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-extrabold tracking-tight text-stone-950">
                {ownOrders.filter((o) => o.statusId === STATUS_LISTO).length}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Listo</span>
            </div>
            <p className="text-xs text-stone-500 mt-2">Lleva estos a la mesa</p>
          </div>
        </section>

        <PayTableSection
          orders={ownOrders}
          gatewayProvider={gatewayProvider}
          onSettled={(label) => triggerToast(`${label} cobrada 💸`)}
        />

        {orderChargeTarget && (
          <ChargeDialog
            target={orderChargeTarget}
            gatewayProvider={gatewayProvider}
            onClose={() => setOrderChargeTarget(null)}
            onSettled={(label) => triggerToast(`${label} cobrado 💸`)}
          />
        )}

        {posOpen && (
          <TakeOrderPanel
            onClose={() => setPosOpen(false)}
            onCreated={(order) =>
              triggerToast(
                `Pedido #${order.id} enviado a ${
                  order.tableNumber === 0 ? "Recepción" : `Mesa ${order.tableNumber ?? "—"}`
                } 🧾`
              )
            }
          />
        )}

        <section>
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <span className="text-xs font-bold tracking-widest text-stone-400 uppercase">Monitoreo</span>
              <h2 className="text-lg font-bold tracking-tight text-stone-950 mt-0.5">Tablero de pedidos</h2>
            </div>
          </div>

          {ordersLoading && ownOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white py-16 text-center text-sm font-medium text-stone-500">
              Cargando órdenes...
            </div>
          ) : assignedTables.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 py-16 px-6 text-center">
              <p className="text-sm font-semibold text-stone-700">
                No tienes mesas asignadas
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Escanea el QR de una mesa o toca &quot;Tomar&quot; en una mesa disponible para empezar a atenderla.
              </p>
            </div>
          ) : ownOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white py-16 text-center text-sm font-medium text-stone-500">
              Sin pedidos en tus mesas por ahora.
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
              {[STATUS_NUEVO, STATUS_PREPARANDO, STATUS_LISTO].map((status) => {
                const col = filteredOrders.filter((o) => o.statusId === status)
                return (
                  <div key={status} className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-stone-200/60 pb-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[status].dot}`} />
                        <h3 className="text-sm font-bold tracking-tight text-stone-900 uppercase">
                          {STATUS_LABEL[status]}
                        </h3>
                      </div>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500">
                        {col.length}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 min-h-[200px]">
                      {col.map((ord) => (
                        <OrderCard
                          key={ord.id}
                          order={ord}
                          config={STATUS_STYLE[ord.statusId]}
                          onAdvance={handleAdvance}
                          onMarkPaid={handleMarkPaid}
                          onSelect={setSelectedOrder}
                          advancing={advancingId === ord.id}
                        />
                      ))}
                      {col.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 px-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50/50 text-center">
                          <p className="text-xs text-stone-400 font-medium">Sin pedidos</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[#FAF9F5] p-6 shadow-2xl animate-card-entrance">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Detalles del pedido</span>
                <h2 className="text-xl font-bold tracking-tight text-stone-950 mt-1">
                  Pedido #{selectedOrder.id} • {tableLabel(selectedOrder)}
                  {selectedOrder.dinerLabel ? ` · ${selectedOrder.dinerLabel}` : ""}
                </h2>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${STATUS_STYLE[selectedOrder.statusId].bg}`}>
                <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[selectedOrder.statusId].dot}`} />
                {STATUS_LABEL[selectedOrder.statusId]}
              </span>
            </div>

            <div className="mt-6 rounded-2xl border border-stone-200/60 bg-white p-4">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Artículos</p>
              {selectedOrder.items.length === 0 ? (
                <p className="text-xs text-stone-500 py-2">Sin items registrados.</p>
              ) : (
                <ul className="divide-y divide-stone-100 text-sm text-stone-700">
                  {selectedOrder.items.map((item) => (
                    <li key={item.id} className="py-2.5 flex justify-between font-semibold">
                      <span>
                        {item.productQuantity}x {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}
                        {item.notes && (
                          <span className="block text-[10px] text-orange-600 italic font-normal mt-0.5">
                            📝 {item.notes}
                          </span>
                        )}
                      </span>
                      <span className="text-stone-500 font-medium">
                        ${(item.productPrice * item.productQuantity).toLocaleString("es-CL")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 pt-4 border-t border-stone-100 flex justify-between items-baseline">
                <span className="text-xs text-stone-500 font-medium">Total:</span>
                <span className="text-lg font-extrabold text-stone-950">
                  ${selectedOrder.total.toLocaleString("es-CL")}
                </span>
              </div>
            </div>

            <div className="mt-4 flex justify-between text-xs text-stone-500 bg-stone-100/80 rounded-xl p-3 border border-stone-200/40">
              <div>
                <span className="font-bold uppercase text-[9px] text-stone-400">Tiempo</span>
                <p className="font-semibold text-stone-700 mt-0.5">
                  {`${elapsedMinutes(selectedOrder, nowMs)} min`}
                </p>
              </div>
              <div className="text-right">
                <span className="font-bold uppercase text-[9px] text-stone-400">Mesa</span>
                <p className="font-semibold text-stone-700 mt-0.5">{tableLabel(selectedOrder)}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-stone-200/60 pt-4">
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-xs font-semibold text-stone-600 hover:border-stone-400 transition cursor-pointer"
              >
                Cerrar
              </button>

              {selectedOrder.statusId < STATUS_LISTO && (
                <button
                  onClick={async () => {
                    const order = selectedOrder
                    setSelectedOrder(null)
                    await handleAdvance(order)
                  }}
                  disabled={advancingId === selectedOrder.id}
                  className="flex items-center gap-1.5 rounded-full bg-stone-950 px-5 py-2.5 text-xs font-bold text-white hover:bg-stone-800 transition cursor-pointer disabled:opacity-50"
                >
                  {selectedOrder.statusId === STATUS_NUEVO ? (
                    <>
                      <ChefHat className="h-3.5 w-3.5" aria-hidden="true" />
                      Iniciar preparación
                    </>
                  ) : (
                    <>
                      <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                      Marcar listo
                    </>
                  )}
                </button>
              )}
              {selectedOrder.statusId === STATUS_LISTO && (
                <button
                  onClick={async () => {
                    const order = selectedOrder
                    setSelectedOrder(null)
                    await handleMarkPaid(order)
                  }}
                  disabled={advancingId === selectedOrder.id}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50"
                >
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                  Marcar pagado
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function OrderCard({
  order,
  config,
  onAdvance,
  onMarkPaid,
  onSelect,
  advancing,
}: {
  order: WaiterOrder
  config: { dot: string; bg: string; glow: string }
  onAdvance: (order: WaiterOrder) => void
  onMarkPaid: (order: WaiterOrder) => void
  onSelect: (ord: WaiterOrder) => void
  advancing: boolean
}) {
  const mins = elapsedMinutes(order)
  const isReady = order.statusId === STATUS_LISTO
  const isTerminal = order.statusId >= STATUS_LISTO

  return (
    <div
      onClick={() => onSelect(order)}
      className="rounded-2xl border bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer hover:border-orange-300"
      style={{
        boxShadow: `0 4px 20px -2px ${config.glow}, 0 2px 4px -1px rgba(0, 0, 0, 0.04)`,
      } as React.CSSProperties}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-bold text-stone-400 uppercase">Orden #{order.id}</span>
          <h4 className="text-sm font-bold text-stone-900 mt-0.5">{tableLabel(order)}</h4>
          {order.dinerLabel && (
            <span className="mt-1 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200/60">
              {order.dinerLabel}
            </span>
          )}
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${config.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          {STATUS_LABEL[order.statusId]}
        </span>
      </div>

      {order.items.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-xs text-stone-600">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between font-medium">
              <span className="truncate pr-2">
                {item.productQuantity}x {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}
              </span>
              <span className="text-stone-400 shrink-0">
                ${(item.productPrice * item.productQuantity).toLocaleString("es-CL")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-400 italic">Sin items</p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
        <div>
          <p className="text-[9px] text-stone-400 font-bold uppercase">Tiempo</p>
          <p className="text-xs font-semibold text-stone-700">
            {isTerminal ? "—" : `${mins} min`}
          </p>
        </div>

        {!isTerminal ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAdvance(order)
            }}
            disabled={advancing}
            className="flex items-center gap-1 rounded-full bg-stone-950 px-3 py-1.5 text-[10px] font-semibold text-white shadow transition hover:bg-stone-800 cursor-pointer disabled:opacity-50"
          >
            <span>{advancing ? "..." : "Siguiente"}</span>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ) : isReady ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkPaid(order)
            }}
            disabled={advancing}
            className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white shadow transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
          >
            {advancing ? (
              <span>...</span>
            ) : (
              <>
                <Wallet className="h-3 w-3" aria-hidden="true" />
                <span>Marcar pagado</span>
              </>
            )}
          </button>
        ) : (
          <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Pagado
          </span>
        )}
      </div>
    </div>
  )
}
