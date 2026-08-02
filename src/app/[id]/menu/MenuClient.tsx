"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Bell, Check, CreditCard, Receipt } from "lucide-react"
import { FloatingCartButton } from "@/components/customer/FloatingCartButton"
import { RecommendationsModal } from "@/components/customer/RecommendationsModal"
import { TableOrdersHeader } from "@/components/customer/TableOrdersHeader"
import { GroupBillSummary } from "@/components/customer/GroupBillSummary"
import { PromotionsSection } from "@/components/customer/PromotionsSection"
import { ProductDetailSheet } from "@/components/customer/ProductDetailSheet"
import { ProductImage } from "@/components/customer/ProductImage"
import { getTopProductsTodayAction } from "@/app/actions/recommendation-actions"
import { requestServiceCallAction } from "@/app/actions/service-call-actions"
import type { RecommendedProduct } from "@/services/recommendation-service"
import { useCartSync } from "@/hooks/useCartSync"
import { useDinerSlot } from "@/hooks/useDinerSlot"
import { useTableCart } from "@/hooks/useTableCart"
import { useTableOrders } from "@/hooks/useTableOrders"
import { getTemplateDesign } from "@/lib/menu/templates"
import { PAYMENT_PROVIDER_LABEL } from "@/lib/payments/types"
import { supabase } from "@/lib/supabase"
import type { MenuData } from "@/types/menu"
import type { Product } from "@/types/product"
import { useTableCartStore } from "@/store/tableCartStore"

function formatEndTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

type ReservedScreenProps = {
  restaurantName: string | undefined
  restaurantLogo: string | null | undefined
  tableNumber: number | null
  endsAt: string
}

function ReservedScreen({ restaurantName, restaurantLogo, tableNumber, endsAt }: ReservedScreenProps) {
  return (
    <main className="min-h-screen bg-black [font-family:var(--font-manrope)] text-[#fafafa] sm:py-4">
      <section className="relative mx-auto flex min-h-screen w-full flex-col items-center justify-center overflow-clip bg-[#0a0a0b] px-6 text-center shadow-[0_30px_80px_rgba(0,0,0,0.5)] sm:min-h-[calc(100vh-32px)] sm:max-w-[440px] sm:rounded-[38px] sm:border-[10px] sm:border-[#050506]">
        <div className="flex items-center gap-2.5">
          {restaurantLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurantLogo}
              alt={restaurantName ?? "Logo"}
              className="h-9 w-9 shrink-0 rounded-full border border-[#fb923c]/60 object-cover"
            />
          ) : (
            <span className="text-lg" aria-hidden="true">🍽️</span>
          )}
          <h1 className="truncate [font-family:var(--font-grotesk)] text-[19px] font-extrabold tracking-[-0.02em]">
            {restaurantName}
          </h1>
        </div>

        <div className="mt-10 flex h-20 w-20 items-center justify-center rounded-full bg-[#fb923c]/12 text-4xl ring-1 ring-[#fb923c]/25">
          🔒
        </div>

        <h2 className="mt-6 [font-family:var(--font-grotesk)] text-[24px] font-extrabold tracking-[-0.01em]">
          Mesa {tableNumber} reservada
        </h2>
        <p className="mt-2 max-w-[18rem] text-[14px] leading-relaxed text-[#a1a1aa]">
          Esta mesa está reservada hasta las{" "}
          <span className="font-bold text-[#fb923c]">{formatEndTime(endsAt)}</span>. No se pueden hacer
          pedidos en este momento. Si llegaste para tu reserva, avisá a un mesero.
        </p>
      </section>
    </main>
  )
}

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

const NEW_PRODUCT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function isNewProduct(createdAt: string | null | undefined) {
  if (!createdAt) return false
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return Date.now() - created < NEW_PRODUCT_WINDOW_MS
}

type ProductCardProps = {
  item: Product
  isPopular?: boolean
  onOpenDetail: (item: Product) => void
}

function ProductCard({ item, isPopular, onOpenDetail }: ProductCardProps) {
  const variants = item.product_variants ?? []
  const hasVariants = variants.length > 0
  // Agotado por stock: si tiene variantes, cuando todas están sin stock; si no,
  // el flag del producto. Se combina con el toggle manual (status_id === 2).
  const stockAgotado = hasVariants ? variants.every((v) => v.stock_out) : !!item.stock_out
  const isAgotado = item.status_id === 2 || stockAgotado
  const isNew = isNewProduct(item.created_at)

  function open() {
    onOpenDetail(item)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
      className={`group relative flex min-h-[128px] w-full cursor-pointer items-stretch overflow-hidden rounded-[26px] border border-[#1f1f23] bg-[#161618] text-left transition active:scale-[0.985] ${
        isAgotado ? "opacity-60" : ""
      }`}
    >
      <div className="relative w-[128px] shrink-0">
        <ProductImage
          src={item.product_image}
          alt={item.product_name}
          className="h-full w-full"
          hasBackground={!item.image_recortada}
          fade="right"
        />
        <div className="absolute left-2.5 top-2.5 z-[3] flex flex-col items-start gap-1.5">
          {isAgotado ? (
            <span className="rounded-full bg-[#dc2626] px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[0.04em] text-white">
              Agotado
            </span>
          ) : isNew ? (
            <span className="rounded-full bg-[#fb923c] px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[0.04em] text-[#1a1a1a]">
              Nuevo
            </span>
          ) : null}
          {isPopular && !isAgotado ? (
            <span className="rounded-full bg-black/55 px-2 py-[3px] text-[9px] font-bold text-[#fbbf24] backdrop-blur">
              ★ Popular
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pl-1 pr-2">
        <h3 className="line-clamp-2 [font-family:var(--font-grotesk)] text-[16px] font-bold leading-tight tracking-[-0.01em] text-[#fafafa]">
          {item.product_name}
        </h3>
        {item.product_description ? (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[#a1a1aa]">
            {item.product_description}
          </p>
        ) : null}
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="[font-family:var(--font-grotesk)] text-[17px] font-extrabold text-[#fb923c]">
            {hasVariants
              ? `Desde ${formatPrice(Math.min(...variants.map((variant) => variant.variant_price)))}`
              : formatPrice(item.product_price)}
          </span>
        </div>
      </div>

      {/* El "+" no agrega directo: lleva al detalle (igual que tocar la card). */}
      <div className="flex shrink-0 items-center pr-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          aria-label={`Ver ${item.product_name}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fb923c] text-[22px] font-light leading-none text-[#1a1a1a] shadow-[0_8px_18px_rgba(251,146,60,0.22)] transition active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  )
}

type MenuClientProps = {
  qrCode: string
  menu: MenuData
}

export function MenuClient({ qrCode, menu }: MenuClientProps) {
  const { restaurant, categories, products, tableId, tableNumber } = menu
  useCartSync(restaurant?.id ?? null)
  const setTable = useTableCartStore((s) => s.setTable)
  useEffect(() => {
    setTable(tableId ?? null, restaurant?.id ?? null, qrCode)
  }, [tableId, restaurant?.id, qrCode, setTable])
  // El menú de pedido es de tema fijo (oscuro); forzamos el modal de
  // recomendaciones al diseño oscuro para que no choque con plantillas claras.
  const design = getTemplateDesign("noche")
  const { info: dinerInfo } = useDinerSlot(tableId ?? null, qrCode)
  const router = useRouter()
  const { orders: tableOrders } = useTableOrders(qrCode)
  const hasHadOrdersRef = useRef(false)
  const resetVersionRef = useRef<number | null>(null)
  const resetRedirectedRef = useRef(false)
  const { addItem, addPromo } = useTableCart(tableId ?? null, restaurant?.id ?? null)
  const [showReco, setShowReco] = useState(false)
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCat, setActiveCat] = useState<number | "all">("all")
  const [billStatus, setBillStatus] = useState<"idle" | "sending" | "requested">("idle")
  // Pago en línea: proveedor conectado del restaurante (null = no disponible).
  const [payProvider, setPayProvider] = useState<string | null>(null)
  const [payStatus, setPayStatus] = useState<"idle" | "paying">("idle")
  const [payerEmail, setPayerEmail] = useState("")
  const [waiterStatus, setWaiterStatus] = useState<"idle" | "sending" | "requested">("idle")
  const [showTipSelector, setShowTipSelector] = useState(false)
  const [selectedTipPct, setSelectedTipPct] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [reservation, setReservation] = useState<{ ends_at: string } | null>(menu.reservation ?? null)

  const searchParams = useSearchParams()
  const cameFromScan = searchParams.get("from") === "scan"

  // Check EN VIVO de reserva (el payload SSR está cacheado 5 min). Si la mesa
  // está reservada se bloquea el pedido; el server igual lo rechaza.
  useEffect(() => {
    if (!qrCode) return
    let cancelled = false

    async function check() {
      const { data, error } = await supabase.rpc("check_table_reservation", { p_qr_token: qrCode })
      if (cancelled || error || !data) return
      const r = data as { reserved: boolean; ends_at: string | null }
      setReservation(r.reserved && r.ends_at ? { ends_at: r.ends_at } : null)
    }

    check()
    const interval = window.setInterval(check, 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [qrCode])

  useEffect(() => {
    if (!qrCode) return
    let cancelled = false

    async function checkResetVersion() {
      const { data, error } = await supabase.rpc("get_table_reset_version_qr", { p_qr_token: qrCode })
      if (cancelled || error) return

      const version = Number(data ?? 0)
      if (!Number.isFinite(version)) return

      if (resetVersionRef.current === null) {
        resetVersionRef.current = version
        return
      }

      if (version !== resetVersionRef.current && !resetRedirectedRef.current) {
        resetRedirectedRef.current = true
        router.replace(`/${qrCode}/gracias`)
      }
    }

    checkResetVersion()
    const interval = window.setInterval(checkResetVersion, 3_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") checkResetVersion()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router, qrCode])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1900)
    return () => window.clearTimeout(t)
  }, [toast])

  // ¿El restaurante tiene pasarela de pago conectada? (fail-closed: si la RPC
  // falla, el botón de pago en línea no se muestra y todo sigue igual).
  useEffect(() => {
    if (!qrCode) return
    let cancelled = false
    supabase
      .rpc("qr_payment_available", { p_qr_token: qrCode })
      .then(({ data, error }) => {
        if (cancelled || error) return
        setPayProvider(typeof data === "string" && data.length > 0 ? data : null)
      })
    return () => {
      cancelled = true
    }
  }, [qrCode])

  // Iniciar el pago en línea: el monto lo calcula el servidor (nunca el
  // cliente); acá solo viajan el QR, la propina elegida y el email.
  async function handlePayOnline() {
    if (!qrCode || payStatus !== "idle") return
    if (payProvider === "flow" && !payerEmail.trim()) {
      setToast("Ingresá tu email para el comprobante")
      return
    }
    setPayStatus("paying")
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payment-create-charge`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            qrToken: qrCode,
            tip: suggestedTip,
            payerEmail: payerEmail.trim() || undefined,
          }),
        }
      )
      const body = (await res.json().catch(() => null)) as
        | { checkoutUrl?: string; error?: string }
        | null
      if (res.ok && body?.checkoutUrl) {
        window.location.assign(body.checkoutUrl)
        return
      }
      setToast(body?.error ?? "No se pudo iniciar el pago")
      setPayStatus("idle")
    } catch {
      setToast("No se pudo iniciar el pago")
      setPayStatus("idle")
    }
  }

  useEffect(() => {
    const restaurantId = restaurant?.id
    if (!restaurantId) return
    const today = new Date().toISOString().slice(0, 10)
    const key = `reco-seen-${restaurantId}-${today}`
    if (typeof window === "undefined") return
    try {
      // Si vienen de escanear el QR, ignoramos el flag previo del día.
      if (cameFromScan) {
        window.localStorage.removeItem(key)
      } else if (window.localStorage.getItem(key)) {
        return
      }
    } catch {
      return
    }

    let cancelled = false
    // El restaurante y el inicio del día se resuelven server-side desde el
    // token QR; el cliente ya no envía restaurantId ni fecha.
    getTopProductsTodayAction(qrCode, 3)
      .then((res) => {
        if (cancelled || !res.ok || res.data.length === 0) return
        setRecommendations(res.data)
        setShowReco(true)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [restaurant?.id, cameFromScan, qrCode])

  function dismissReco() {
    setShowReco(false)
    const restaurantId = restaurant?.id
    if (!restaurantId) return
    const today = new Date().toISOString().slice(0, 10)
    try {
      window.localStorage.setItem(`reco-seen-${restaurantId}-${today}`, "1")
    } catch {
      // ignore
    }
  }

  function handleRecoAdd(productId: number, variantId: number | null, price: number) {
    if (!tableId || !restaurant?.id) return
    addItem({ productId, variantId, price, quantity: 1 })
    setToast("Agregado al pedido")
  }

  // Total de la mesa: suma de los totales de los pedidos activos. Base para
  // calcular la propina sugerida.
  const tableTotal = useMemo(
    () => tableOrders.reduce((sum, o) => sum + (o.total ?? 0), 0),
    [tableOrders]
  )

  const TIP_OPTIONS: Array<{ label: string; pct: number }> = [
    { label: "Sin propina", pct: 0 },
    { label: "10%", pct: 10 },
    { label: "15%", pct: 15 },
    { label: "20%", pct: 20 },
  ]

  const suggestedTip = Math.round((tableTotal * selectedTipPct) / 100)

  function openTipSelector() {
    if (billStatus !== "idle") return
    setShowTipSelector((v) => !v)
  }

  async function handleRequestBill(tip: number) {
    if (!qrCode || billStatus !== "idle") return
    setBillStatus("sending")
    setShowTipSelector(false)
    try {
      const res = await requestServiceCallAction(
        qrCode,
        dinerInfo?.token ?? null,
        "bill",
        tip
      )
      if (res.ok) {
        setBillStatus("requested")
        setToast(
          tip > 0
            ? `Pedimos tu cuenta con ${formatPrice(tip)} de propina · un mesero irá a tu mesa`
            : "Pedimos tu cuenta · un mesero irá a tu mesa"
        )
      } else {
        setBillStatus("idle")
        setToast("No se pudo pedir la cuenta")
      }
    } catch {
      setBillStatus("idle")
      setToast("No se pudo pedir la cuenta")
    }
  }

  async function handleCallWaiter() {
    if (!qrCode || waiterStatus !== "idle") return
    setWaiterStatus("sending")
    try {
      const res = await requestServiceCallAction(
        qrCode,
        dinerInfo?.token ?? null,
        "waiter",
        0
      )
      if (res.ok) {
        setWaiterStatus("requested")
        setToast("Llamamos al mesero · irá a tu mesa")
      } else {
        setWaiterStatus("idle")
        setToast("No se pudo llamar al mesero")
      }
    } catch {
      setWaiterStatus("idle")
      setToast("No se pudo llamar al mesero")
    }
  }

  useEffect(() => {
    if (tableOrders.length > 0) {
      hasHadOrdersRef.current = true
      return
    }
    // Transición a 0 pedidos activos en la mesa = mesa cobrada en su totalidad.
    // El RPC server-side ya borró los registros de table_diners, así que el
    // próximo cliente arrancará como Comensal 1.
    if (hasHadOrdersRef.current) {
      router.replace(`/${qrCode}/gracias`)
    }
  }, [tableOrders.length, router, qrCode])

  const availableProducts = useMemo(
    () => products.filter((product) => product.status_id !== 3),
    [products]
  )

  // Solo categorías con al menos un producto disponible.
  const visibleCategories = useMemo(
    () => categories.filter((cat) => availableProducts.some((product) => product.category_id === cat.id)),
    [categories, availableProducts]
  )

  // Categoría efectiva: "all" (Todos) por defecto, o la activa si sigue siendo
  // válida; si la activa ya no existe, vuelve a "all". Se deriva en render (sin
  // setState en efecto) para que el primer render ya muestre productos.
  const effectiveCat = useMemo<number | "all">(() => {
    if (activeCat === "all") return "all"
    if (visibleCategories.some((c) => c.id === activeCat)) return activeCat
    return "all"
  }, [activeCat, visibleCategories])

  const searchedProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    if (!query) return []
    return availableProducts.filter((p) => {
      const name = p.product_name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      const desc = (p.product_description ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      return name.includes(query) || desc.includes(query)
    })
  }, [availableProducts, searchQuery])

  const isSearching = searchQuery.trim().length > 0
  const displayedProducts = useMemo(() => {
    if (isSearching) return searchedProducts
    if (effectiveCat === "all") return availableProducts
    return availableProducts.filter((p) => p.category_id === effectiveCat)
  }, [isSearching, searchedProducts, availableProducts, effectiveCat])

  // Mesa reservada: bloqueamos el menú por completo (el server también rechaza
  // pedidos/carrito). Va después de todos los hooks para no romper su orden.
  if (reservation) {
    return (
      <ReservedScreen
        restaurantName={restaurant?.restaurant_name}
        restaurantLogo={restaurant?.restaurant_logo}
        tableNumber={tableNumber}
        endsAt={reservation.ends_at}
      />
    )
  }

  return (
    <main className="min-h-screen bg-black [font-family:var(--font-manrope)] text-[#fafafa] sm:py-4">
      <section className="relative mx-auto flex min-h-screen w-full flex-col overflow-clip bg-[#0a0a0b] pb-28 shadow-[0_30px_80px_rgba(0,0,0,0.5)] sm:min-h-[calc(100vh-32px)] sm:max-w-[440px] sm:rounded-[38px] sm:border-[10px] sm:border-[#050506]">
        {/* ── Cabecera (marca + cuenta) ── */}
        <div className="px-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {restaurant?.restaurant_logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurant.restaurant_logo}
                  alt={restaurant.restaurant_name}
                  className="h-9 w-9 shrink-0 rounded-full border border-[#fb923c]/60 object-cover"
                />
              ) : (
                <span className="text-lg" aria-hidden="true">🍽️</span>
              )}
              <h1 className="truncate [font-family:var(--font-grotesk)] text-[21px] font-extrabold tracking-[-0.02em] text-[#fafafa]">
                {restaurant?.restaurant_name}
              </h1>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={handleCallWaiter}
                disabled={waiterStatus !== "idle"}
                className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition active:scale-95 ${
                  waiterStatus === "requested"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "border border-[#3f3f46] bg-[#18181b] text-[#fafafa] disabled:opacity-70"
                }`}
              >
                {waiterStatus === "requested" ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Mesero en camino
                  </>
                ) : waiterStatus === "sending" ? (
                  "Llamando..."
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                    Llamar al mesero
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={openTipSelector}
                disabled={billStatus !== "idle"}
                aria-expanded={showTipSelector}
                className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition active:scale-95 ${
                  billStatus === "requested"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "bg-[#fb923c] text-[#1a1a1a] disabled:opacity-70"
                }`}
              >
                {billStatus === "requested" ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Cuenta pedida
                  </>
                ) : billStatus === "sending" ? (
                  "Pidiendo..."
                ) : (
                  <>
                    <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                    Pedir la cuenta
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── Selector de propina (E2) ── */}
          {showTipSelector && billStatus === "idle" && (
            <div className="mt-3 rounded-2xl border border-[#232327] bg-[#131315] p-3">
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-[#fafafa]">
                ¿Agregar propina?
              </p>
              {tableTotal > 0 && (
                <p className="mt-1 text-[12px] text-[#a1a1aa]">
                  Total mesa {formatPrice(tableTotal)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {TIP_OPTIONS.map((opt) => {
                  const active = opt.pct === selectedTipPct
                  const amount = Math.round((tableTotal * opt.pct) / 100)
                  return (
                    <button
                      key={opt.pct}
                      type="button"
                      onClick={() => setSelectedTipPct(opt.pct)}
                      className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition active:scale-95 ${
                        active
                          ? "bg-[#fb923c] text-[#1a1a1a]"
                          : "border border-[#27272a] bg-[#18181b] text-[#d4d4d8]"
                      }`}
                    >
                      {opt.label}
                      {opt.pct > 0 && amount > 0 ? ` · ${formatPrice(amount)}` : ""}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTipSelector(false)}
                  className="rounded-full border border-[#27272a] bg-[#18181b] px-4 py-2 text-[12.5px] font-bold text-[#d4d4d8] transition active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestBill(suggestedTip)}
                  className="flex-1 rounded-full bg-[#fb923c] px-4 py-2 text-[12.5px] font-extrabold text-[#1a1a1a] transition active:scale-95"
                >
                  {suggestedTip > 0
                    ? `Pedir la cuenta · +${formatPrice(suggestedTip)}`
                    : "Pedir la cuenta sin propina"}
                </button>
              </div>

              {/* ── Pago en línea (solo si el restaurante tiene pasarela conectada) ── */}
              {payProvider && tableTotal > 0 && (
                <div className="mt-3 border-t border-[#232327] pt-3">
                  {payProvider === "flow" && (
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                      placeholder="Tu email (para el comprobante)"
                      className="mb-2 w-full rounded-full border border-[#27272a] bg-[#18181b] px-4 py-2 text-[12.5px] text-[#fafafa] placeholder:text-[#71717a] focus:border-[#fb923c] focus:outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handlePayOnline}
                    disabled={payStatus !== "idle"}
                    className="flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2.5 text-[12.5px] font-extrabold text-[#0a0a0a] transition active:scale-95 disabled:opacity-60"
                  >
                    {payStatus === "paying" ? (
                      "Conectando con la pasarela..."
                    ) : (
                      <>
                        <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                        Pagar en línea · {formatPrice(tableTotal + suggestedTip)}
                      </>
                    )}
                  </button>
                  <p className="mt-1.5 text-center text-[10.5px] text-[#71717a]">
                    Pago seguro procesado por {PAYMENT_PROVIDER_LABEL[payProvider] ?? payProvider}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Tira de mesa ── */}
          <div className="mt-3 flex items-center gap-1.5">
            <span className="rounded-full bg-[#fb923c] px-2.5 py-1 text-[11.5px] font-bold text-[#1a1a1a]">
              Mesa {tableNumber}
            </span>
            {dinerInfo && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-[12px] text-[#a1a1aa]">{dinerInfo.label}</span>
              </>
            )}
          </div>

          {/* ── Pedidos en curso ── */}
          <TableOrdersHeader qrCode={qrCode} />

          {/* ── Cuenta grupal (E4) ── */}
          <GroupBillSummary orders={tableOrders} />
        </div>

        {/* ── Buscador + categorías (sticky) ── */}
        <div className="sticky top-0 z-30 border-b border-[#1f1f23] bg-[#0a0a0b]/92 px-4 pb-3 pt-3 backdrop-blur-xl">
          <div className="flex h-11 items-center gap-2.5 rounded-2xl border border-[#27272a] bg-[#18181b] px-3.5">
            <svg className="h-[18px] w-[18px] shrink-0 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar platos, ingredientes…"
              className="h-full flex-1 bg-transparent text-[14.5px] font-medium text-[#fafafa] outline-none placeholder:text-[#71717a]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="flex shrink-0 items-center text-[#a1a1aa] transition hover:text-[#fafafa]"
                type="button"
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>

          {!isSearching && visibleCategories.length > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <button
                type="button"
                onClick={() => setActiveCat("all")}
                className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                  effectiveCat === "all"
                    ? "bg-[#fb923c] text-[#1a1a1a]"
                    : "border border-[#27272a] bg-[#18181b] text-[#d4d4d8]"
                }`}
              >
                Todos
              </button>
              {visibleCategories.map((cat) => {
                const active = cat.id === effectiveCat
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCat(cat.id)}
                    className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                      active
                        ? "bg-[#fb923c] text-[#1a1a1a]"
                        : "border border-[#27272a] bg-[#18181b] text-[#d4d4d8]"
                    }`}
                  >
                    {cat.category_name}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        {/* ── Promociones (solo en la vista general, sin búsqueda) ── */}
        {!isSearching && effectiveCat === "all" && (
          <PromotionsSection
            promotions={menu.promotions ?? []}
            products={menu.products ?? []}
            onAdd={addPromo}
          />
        )}

        {/* ── Listado ── */}
        <div className="flex-1 px-4 pt-4">
          {isSearching && (
            <p className="mb-3.5 text-[13px] text-[#a1a1aa]">
              {displayedProducts.length} resultado{displayedProducts.length !== 1 ? "s" : ""} para “{searchQuery.trim()}”
            </p>
          )}

          {displayedProducts.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {displayedProducts.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  isPopular={recommendations.some((r) => r.id === item.id)}
                  onOpenDetail={setDetailProduct}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
              <svg className="h-7 w-7 text-[#52525b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="mt-1 text-base font-bold text-[#fafafa]">
                {isSearching ? "Sin coincidencias" : "Aun no hay productos disponibles"}
              </p>
              <p className="text-[13px] text-[#71717a]">
                {isSearching ? "Prueba con otro plato o revisa las categorias." : "Vuelve a intentarlo más tarde."}
              </p>
              {isSearching && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-3 rounded-full bg-[#fb923c] px-4 py-2 text-xs font-extrabold text-[#1a1a1a] transition active:scale-95"
                >
                  Limpiar busqueda
                </button>
              )}
            </div>
          )}

          <div className="h-6" />
        </div>
      </section>

      {restaurant && tableId ? (
        <FloatingCartButton tableId={tableId} restaurantId={restaurant.id} />
      ) : null}

      {detailProduct ? (
        <ProductDetailSheet
          product={detailProduct}
          tableId={tableId ?? null}
          restaurantId={restaurant?.id ?? null}
          onClose={() => setDetailProduct(null)}
          onAdded={(name) => setToast(`${name} agregado`)}
        />
      ) : null}

      {toast && (
        <div className="animate-toast-in fixed bottom-[88px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#3f3f46] bg-[#27272a] px-[18px] py-[11px] text-[13.5px] font-semibold text-[#fafafa] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          {toast}
        </div>
      )}

      <RecommendationsModal
        isOpen={showReco}
        onClose={dismissReco}
        recommendations={recommendations}
        design={design}
        onAdd={handleRecoAdd}
        canAdd={!!tableId && !!restaurant?.id}
      />
    </main>
  )
}
