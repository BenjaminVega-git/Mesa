"use client"

import { useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { useRestaurant } from "@/hooks/useRestaurant"
import { useCategories } from "@/hooks/useCategories"
import { useProducts } from "@/hooks/useProducts"
import { invalidateCache } from "@/hooks/useCache"
import {
  updateDeliveryConfig,
  updateLocationConfig,
  updateMenuTemplate,
  updateOrderDestination,
  updateOutputMode,
  updateReservationConfig,
  updateRestaurantCity,
  updateRestaurantLogo,
  updateRestaurantName,
} from "@/services/restaurant-service"
import { getPaymentAccount } from "@/services/payments-service"
import { LogoUploader } from "@/components/admin/LogoUploader"
import { PaymentGatewaySection } from "@/components/admin/PaymentGatewaySection"
import { MENU_TEMPLATES, getTemplateDesign } from "@/lib/menu/templates"
import type { MenuTemplate, OrderDestination, OutputMode, ReservationContactType, Restaurant } from "@/types/restaurant"
import type { Category } from "@/types/category"
import type { Product } from "@/types/product"

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

type PreviewBodyProps = {
  template: MenuTemplate
  restaurantName: string | undefined
  restaurantLogo: string | null | undefined
  previewCategories: Category[]
  previewProducts: Product[]
}

function getCategoryPlaceholder(categoryName: string) {
  const name = (categoryName ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  if (name.includes("bebida") || name.includes("trago") || name.includes("jugo") || name.includes("coctel") || name.includes("cerv") || name.includes("alcohol") || name.includes("vino") || name.includes("bebestible")) {
    return {
      emoji: "🍹",
      bg: "bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500",
    }
  }
  if (name.includes("postre") || name.includes("dulce") || name.includes("helado") || name.includes("torta") || name.includes("pastela") || name.includes("cafe") || name.includes("infusion") || name.includes("te")) {
    return {
      emoji: "🍰",
      bg: "bg-gradient-to-br from-pink-400 via-fuchsia-500 to-purple-600",
    }
  }
  if (name.includes("hamburg") || name.includes("burger") || name.includes("sandwich") || name.includes("completo") || name.includes("churrasco") || name.includes("entrad") || name.includes("picoteo") || name.includes("papa")) {
    return {
      emoji: "🍔",
      bg: "bg-gradient-to-br from-yellow-400 via-amber-500 to-red-600",
    }
  }
  if (name.includes("piz") || name.includes("pasta") || name.includes("italiana")) {
    return {
      emoji: "🍕",
      bg: "bg-gradient-to-br from-red-400 via-orange-500 to-yellow-500",
    }
  }
  if (name.includes("ensalada") || name.includes("sana") || name.includes("vege") || name.includes("vegan")) {
    return {
      emoji: "🥗",
      bg: "bg-gradient-to-br from-green-400 via-emerald-500 to-teal-600",
    }
  }
  if (name.includes("carne") || name.includes("parrilla") || name.includes("asado") || name.includes("pollo") || name.includes("lomo") || name.includes("bife") || name.includes("pescado")) {
    return {
      emoji: "🍖",
      bg: "bg-gradient-to-br from-red-500 via-red-700 to-stone-800",
    }
  }
  return {
    emoji: "🍽️",
    bg: "bg-gradient-to-br from-orange-400 via-amber-500 to-stone-700",
  }
}

function PreviewBody({ template, restaurantName, restaurantLogo, previewCategories, previewProducts }: PreviewBodyProps) {
  const design = getTemplateDesign(template)

  const isLight = template === "nordic-minimal"

  const overlayBg =
    template === "aurora" ? "bg-[#090d16]"
    : template === "cyber-ruby" ? "bg-[#090514]"
    : template === "eclipse" ? "bg-[#050507]"
    : template === "forest-moss" ? "bg-[#0b1411]"
    : template === "nordic-minimal" ? "bg-[#eef3f7]"
    : "bg-stone-950"
  const overlayGradient =
    template === "aurora"
      ? "bg-[radial-gradient(circle_at_15%_20%,rgba(91,33,182,0.45)_0%,transparent_50%),radial-gradient(circle_at_85%_80%,rgba(6,182,212,0.3)_0%,transparent_50%)]"
      : template === "cyber-ruby"
      ? "bg-[radial-gradient(circle_at_85%_20%,rgba(217,70,239,0.18)_0%,transparent_50%),radial-gradient(circle_at_15%_80%,rgba(29,78,216,0.15)_0%,transparent_50%)]"
      : template === "eclipse"
      ? "bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.06)_0%,transparent_50%)]"
      : template === "forest-moss"
      ? "bg-[radial-gradient(circle_at_85%_20%,rgba(245,158,11,0.22)_0%,transparent_45%),radial-gradient(circle_at_20%_80%,rgba(22,163,74,0.32)_0%,transparent_60%),radial-gradient(circle_at_50%_50%,rgba(163,230,53,0.06)_0%,transparent_60%)]"
      : template === "nordic-minimal"
      ? "bg-[linear-gradient(120deg,rgba(235,243,250,1)_0%,rgba(225,235,245,0.6)_40%,rgba(240,244,248,1)_100%),linear-gradient(45deg,transparent_70%,rgba(215,228,240,0.4)_70%)]"
      : "bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.22),_transparent_34%),radial-gradient(circle_at_85%_12%,_rgba(120,53,15,0.34),_transparent_28%),linear-gradient(180deg,_#1c1917_0%,_#0c0a09_58%,_#020617_100%)]"

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl border border-stone-200 shadow-inner">
      <div className={`absolute inset-0 ${overlayBg}`} />
      <div className={`pointer-events-none absolute inset-0 ${overlayGradient}`} />

      <div className="relative h-full overflow-y-auto p-3">
        {/* Header Premium del Restaurante Preview */}
        <div className={`flex items-center justify-between gap-2 p-2 rounded-2xl ${design.card}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0 flex items-center justify-center">
              {/* Glowing halo behind logo */}
              <div className={`absolute inset-0 -m-0.5 rounded-full opacity-60 blur-xs animate-pulse-glow ${
                isLight ? "bg-gradient-to-tr from-slate-400 to-slate-500" : "bg-gradient-to-tr from-orange-500 to-amber-400"
              }`} />
              {restaurantLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurantLogo}
                  alt={restaurantName ?? "Logo"}
                  className={`relative z-10 h-7 w-7 rounded-full border object-cover shadow-sm ${
                    isLight ? "border-slate-300" : "border-white/20"
                  }`}
                />
              ) : (
                <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[9px] font-black shadow-sm ${
                  isLight ? "border-slate-300 bg-gradient-to-tr from-slate-200 to-slate-100 text-slate-800" : "border-white/20 bg-gradient-to-tr from-stone-800 to-stone-900 text-orange-200"
                }`}>
                  {(restaurantName ?? "MR").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h4 className={`truncate text-xs font-black tracking-tight leading-none ${design.titleClass}`}>
                {restaurantName ?? "Mi Restaurante"}
              </h4>
              <p className={`text-[8px] font-semibold mt-0.5 ${design.mesaText}`}>Mesa 1</p>
            </div>
          </div>

          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold ${design.abiertoBadge} flex items-center gap-1`}>
            <span className="relative flex h-1 w-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1 w-1 bg-emerald-500"></span>
            </span>
            Abierto
          </span>
        </div>

        {/* Buscador Mock */}
        <div className="mt-2.5 relative">
          <div className={`absolute inset-y-0 left-2.5 flex items-center pointer-events-none ${isLight ? "text-slate-400" : "text-white/40"}`}>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            disabled
            placeholder="Buscar..."
            className={`w-full pl-7 pr-3 py-1.5 text-[10px] rounded-xl outline-none ring-1 opacity-80 cursor-not-allowed ${
              design.card
            } ${
              isLight ? "placeholder:text-slate-400 text-slate-800" : "placeholder:text-white/30 text-white"
            }`}
          />
        </div>

        <div className="mt-3 flex gap-1.5 overflow-hidden">
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${design.pillActive}`}>
            Todo
          </span>
          {previewCategories.slice(0, 2).map((cat) => (
            <span
              key={cat.id}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${design.pillInactive}`}
            >
              {cat.category_name}
            </span>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {previewProducts.length === 0 ? (
            <p className={`rounded-2xl px-3 py-4 text-center text-[10px] font-medium ${design.card} ${design.cardDesc}`}>
              Cargá productos y categorías para verlos acá.
            </p>
          ) : (
            previewProducts.map((item) => {
              const placeholder = getCategoryPlaceholder(item.categories?.category_name ?? "")
              return (
                <div
                  key={item.id}
                  className={`flex gap-2 rounded-2xl p-2 ${design.card}`}
                >
                  <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl ${
                    item.product_image ? design.cardImageBg : placeholder.bg
                  }`}>
                    {item.product_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.product_image} alt={item.product_name} className="h-full w-full object-contain p-1.5" />
                    ) : (
                      <span className="text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]">{placeholder.emoji}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[9px] font-bold ${design.cardCat}`}>
                      {item.categories?.category_name}
                    </p>
                    <p className={`mt-0.5 line-clamp-1 text-xs font-black leading-tight ${design.cardName}`}>
                      {item.product_name}
                    </p>
                    <p className={`mt-1 text-[10px] font-black ${design.cardPrice}`}>
                      {formatPrice(item.product_price)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

type RestaurantNameSectionProps = {
  currentName: string | undefined
  onSaved: () => void
}

function RestaurantNameSection({ currentName, onSaved }: RestaurantNameSectionProps) {
  const [override, setOverride] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const name = override ?? currentName ?? ""
  const isDirty = override !== null && override.trim() !== (currentName ?? "").trim()

  async function handleSave() {
    if (saving || !isDirty) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateRestaurantName({ name: name.trim() })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setOverride(null)
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Nombre del restaurante</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Es el nombre que aparece en el menú público y en el panel.
      </p>

      <div className="mt-5 max-w-md">
        <input
          type="text"
          value={name}
          onChange={(e) => setOverride(e.target.value)}
          maxLength={60}
          placeholder="Mi Restaurante"
          className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
        />
      </div>

      {feedback && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs font-medium text-stone-400">Sin cambios.</span>
        )}
      </div>
    </section>
  )
}

type RestaurantLogoSectionProps = {
  currentLogo: string | null | undefined
  onSaved: () => void
}

function RestaurantLogoSection({ currentLogo, onSaved }: RestaurantLogoSectionProps) {
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  async function handleChange(url: string | null) {
    if (saving) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateRestaurantLogo({ logo: url })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setFeedback({ kind: "ok", message: url ? "Logo actualizado" : "Logo quitado" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Logo del restaurante</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Aparece en el menú público y en el panel. Es opcional.
      </p>

      <div className="mt-5">
        <LogoUploader
          value={currentLogo ?? null}
          onChange={handleChange}
          disabled={saving}
        />
      </div>

      {feedback && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </section>
  )
}

type RestaurantCitySectionProps = {
  currentCity: string | null | undefined
  onSaved: () => void
}

function RestaurantCitySection({ currentCity, onSaved }: RestaurantCitySectionProps) {
  const [override, setOverride] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const city = override ?? currentCity ?? ""
  const isDirty = override !== null && override.trim() !== (currentCity ?? "").trim()

  async function handleSave() {
    if (saving || !isDirty) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateRestaurantCity({ city: city.trim() || null })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setOverride(null)
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Ciudad / Región</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Aparece en el directorio público de restaurantes en la página principal.
      </p>

      <div className="mt-5 max-w-md">
        <input
          type="text"
          value={city}
          onChange={(e) => setOverride(e.target.value)}
          maxLength={80}
          placeholder="Ej. Santiago, Providencia"
          className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
        />
      </div>

      {feedback && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs font-medium text-stone-400">Sin cambios.</span>
        )}
      </div>
    </section>
  )
}

type DeliverySectionProps = {
  restaurant: Restaurant | null
  onSaved: () => void
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function DeliverySection({ restaurant, onSaved }: DeliverySectionProps) {
  const initialEnabled = restaurant?.delivery_enabled ?? false
  const initialSlug = restaurant?.delivery_slug ?? ""
  const initialHomeDelivery = restaurant?.delivery_home_enabled ?? true
  const initialPickup = restaurant?.pickup_enabled ?? false
  const initialOnlinePayment = restaurant?.delivery_online_payment_enabled ?? true
  const initialPayAtStore = restaurant?.delivery_pay_at_store_enabled ?? true
  const initialDeliveryFee = restaurant?.delivery_fee ?? null

  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null)
  const [slugOverride, setSlugOverride] = useState<string | null>(null)
  const [homeDeliveryOverride, setHomeDeliveryOverride] = useState<boolean | null>(null)
  const [pickupOverride, setPickupOverride] = useState<boolean | null>(null)
  const [onlinePaymentOverride, setOnlinePaymentOverride] = useState<boolean | null>(null)
  const [payAtStoreOverride, setPayAtStoreOverride] = useState<boolean | null>(null)
  const [deliveryFeeOverride, setDeliveryFeeOverride] = useState<string | null>(null)
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false)
  const [loadingPaymentAccount, setLoadingPaymentAccount] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const qrRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let mounted = true
    getPaymentAccount().then((result) => {
      if (!mounted) return
      setOnlinePaymentAvailable(
        result.ok && result.data.status === "connected" && result.data.active !== false,
      )
      setLoadingPaymentAccount(false)
    })
    return () => {
      mounted = false
    }
  }, [])

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "")
  const publicUrl = initialSlug ? `${baseUrl}/restaurants/${initialSlug}` : ""

  async function handleCopy() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setFeedback({ kind: "error", message: "No se pudo copiar al portapapeles" })
    }
  }

  function handleDownloadQr() {
    if (!publicUrl || !qrRef.current || typeof window === "undefined") return
    const svg = qrRef.current.cloneNode(true) as SVGSVGElement
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = `${initialSlug || "delivery"}-qr.svg`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  const enabled = enabledOverride ?? initialEnabled
  const slug = slugOverride ?? initialSlug
  const homeDelivery = homeDeliveryOverride ?? initialHomeDelivery
  const pickup = pickupOverride ?? initialPickup
  const onlinePayment = onlinePaymentOverride ?? initialOnlinePayment
  const payAtStore = payAtStoreOverride ?? initialPayAtStore
  const deliveryFeeText = deliveryFeeOverride ?? (initialDeliveryFee == null ? "" : String(initialDeliveryFee))
  const deliveryFee = deliveryFeeText.trim() === "" ? null : Number(deliveryFeeText)
  const configuredOnlinePayment = onlinePayment && onlinePaymentAvailable
  const isDirty =
    enabled !== initialEnabled ||
    homeDelivery !== initialHomeDelivery ||
    pickup !== initialPickup ||
    configuredOnlinePayment !== initialOnlinePayment ||
    payAtStore !== initialPayAtStore ||
    deliveryFee !== initialDeliveryFee ||
    (slugOverride !== null && slugOverride.trim() !== initialSlug.trim())

  async function handleSave() {
    if (saving || !isDirty) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateDeliveryConfig({
        enabled,
        slug: slug.trim() || null,
        homeDelivery,
        pickup,
        onlinePayment: configuredOnlinePayment,
        payAtStore,
        deliveryFee,
      })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setEnabledOverride(null)
      setSlugOverride(null)
      setHomeDeliveryOverride(null)
      setPickupOverride(null)
      setOnlinePaymentOverride(null)
      setPayAtStoreOverride(null)
      setDeliveryFeeOverride(null)
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  function handleAutoSlug() {
    if (!restaurant?.restaurant_name) return
    setSlugOverride(slugify(restaurant.restaurant_name))
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Pedidos online</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Comparte tu menú público para recibir pedidos a domicilio, para retiro o ambos.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEnabledOverride(!enabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition ${
            enabled ? "bg-orange-500" : "bg-stone-200"
          }`}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm font-semibold text-stone-900">
          {enabled ? "Pedidos online activados" : "Pedidos online desactivados"}
        </span>
      </div>

      {enabled && (
        <div className="mt-6 max-w-md">
          <fieldset className="mb-6">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Modalidades disponibles
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${homeDelivery ? "border-orange-300 bg-orange-50" : "border-stone-200 bg-white"}`}>
                <input
                  type="checkbox"
                  checked={homeDelivery}
                  onChange={(event) => setHomeDeliveryOverride(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-orange-500"
                />
                <span>
                  <span className="block text-sm font-bold text-stone-900">Entrega a domicilio</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">Solicita dirección y referencia.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${pickup ? "border-orange-300 bg-orange-50" : "border-stone-200 bg-white"}`}>
                <input
                  type="checkbox"
                  checked={pickup}
                  onChange={(event) => setPickupOverride(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-orange-500"
                />
                <span>
                  <span className="block text-sm font-bold text-stone-900">Retiro en tienda</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">No solicita ubicación al cliente.</span>
                </span>
              </label>
            </div>
          </fieldset>

          {homeDelivery ? (
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500" htmlFor="delivery-fee">
                Costo de entrega (opcional)
              </label>
              <div className="mt-2 flex items-center rounded-xl border border-stone-200 bg-stone-50 px-3 focus-within:border-orange-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-100">
                <span className="text-sm font-bold text-stone-500">$</span>
                <input
                  id="delivery-fee"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10_000_000}
                  step={1}
                  value={deliveryFeeText}
                  onChange={(event) => setDeliveryFeeOverride(event.target.value)}
                  placeholder="Sin costo"
                  className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm text-stone-900 outline-none"
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-stone-500">
                Déjalo vacío o en $0 para ofrecer entrega sin recargo. No se aplica al retiro en tienda.
              </p>
            </div>
          ) : null}

          <fieldset className="mb-6">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Formas de pago para el cliente
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className={`flex items-start gap-3 rounded-xl border p-3 ${!onlinePaymentAvailable || loadingPaymentAccount ? "cursor-not-allowed border-stone-200 bg-stone-100 opacity-60" : configuredOnlinePayment ? "cursor-pointer border-orange-300 bg-orange-50" : "cursor-pointer border-stone-200 bg-white"}`}>
                <input
                  type="checkbox"
                  checked={configuredOnlinePayment}
                  disabled={loadingPaymentAccount || !onlinePaymentAvailable}
                  onChange={(event) => setOnlinePaymentOverride(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-orange-500"
                />
                <span>
                  <span className="block text-sm font-bold text-stone-900">Pago anticipado</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">
                    {!loadingPaymentAccount && !onlinePaymentAvailable
                      ? "Conecta y activa los cobros en línea para habilitarlo."
                      : "El cliente paga online antes de enviar el pedido."}
                  </span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${payAtStore ? "border-orange-300 bg-orange-50" : "border-stone-200 bg-white"}`}>
                <input
                  type="checkbox"
                  checked={payAtStore}
                  onChange={(event) => setPayAtStoreOverride(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-orange-500"
                />
                <span>
                  <span className="block text-sm font-bold text-stone-900">Pago al llegar al local</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">El cliente paga al retirar o recibir el pedido.</span>
                </span>
              </label>
            </div>
          </fieldset>

          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">
            Identificador (slug)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlugOverride(e.target.value.toLowerCase())}
              placeholder="la-parrilla-de-benja"
              maxLength={60}
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-mono text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
            />
            {restaurant?.restaurant_name && (
              <button
                type="button"
                onClick={handleAutoSlug}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-stone-50"
              >
                Sugerir
              </button>
            )}
          </div>
          {!initialSlug && slug.trim() && (
            <p className="mt-2 text-[11px] leading-4 text-stone-500">
              Tu URL pública será:{" "}
              <span className="font-mono font-semibold text-stone-700">
                {baseUrl}/restaurants/{slug.trim()}
              </span>
            </p>
          )}

          {initialSlug && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Tu URL pública
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-mono text-stone-700 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                    copied
                      ? "bg-emerald-500 text-white"
                      : "bg-stone-900 text-white hover:bg-stone-800"
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Copiado
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h4a2 2 0 002-2M8 5a2 2 0 012-2h4a2 2 0 012 2m2 0h2a2 2 0 012 2v3" />
                      </svg>
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center">
                <div className="shrink-0 rounded-xl bg-white p-3 shadow-sm">
                  <QRCodeSVG ref={qrRef} value={publicUrl} size={176} level="H" marginSize={2} />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">QR del delivery</p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Al escanearlo abrirá exactamente el mismo enlace público de arriba.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="mt-3 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-stone-800"
                  >
                    Descargar QR
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-4 text-stone-500">
            Solo minúsculas, números y guiones. Debe ser único entre todos los locales de MESA.
          </p>
        </div>
      )}

      {feedback && (
        <p
          className={`mt-5 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs font-medium text-stone-400">Sin cambios.</span>
        )}
      </div>
    </section>
  )
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Permiso de ubicación denegado. Actívalo en el navegador y en el sistema."
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "No se pudo calcular la ubicación. Prueba con un teléfono dentro del local."
  }
  if (error.code === error.TIMEOUT) {
    return "El GPS tardó demasiado en responder. Reintenta desde un lugar con mejor señal."
  }
  return "No se pudo obtener la ubicación. Revisa el permiso de GPS."
}

function LocationSection({ restaurant, onSaved }: OrderHandlingSectionProps) {
  const initialEnabled = restaurant?.location_check_enabled ?? false
  const initialLatitude = restaurant?.location_latitude ?? null
  const initialLongitude = restaurant?.location_longitude ?? null
  const initialAccuracyM = restaurant?.location_accuracy_m ?? null
  const initialRadius = restaurant?.location_radius_m ?? 120

  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null)
  const [latitudeOverride, setLatitudeOverride] = useState<number | null | undefined>(undefined)
  const [longitudeOverride, setLongitudeOverride] = useState<number | null | undefined>(undefined)
  const [accuracyOverride, setAccuracyOverride] = useState<number | null | undefined>(undefined)
  const [radiusOverride, setRadiusOverride] = useState<number | null>(null)
  const [allowLowAccuracy, setAllowLowAccuracy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const enabled = enabledOverride ?? initialEnabled
  const latitude = latitudeOverride !== undefined ? latitudeOverride : initialLatitude
  const longitude = longitudeOverride !== undefined ? longitudeOverride : initialLongitude
  const accuracyM = accuracyOverride !== undefined ? accuracyOverride : initialAccuracyM
  const radiusM = radiusOverride ?? initialRadius
  const hasLocation = latitude != null && longitude != null
  const isDirty =
    enabled !== initialEnabled ||
    latitude !== initialLatitude ||
    longitude !== initialLongitude ||
    accuracyM !== initialAccuracyM ||
    radiusM !== initialRadius

  function captureLocation(nextEnabled = enabled) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setFeedback({ kind: "error", message: "Este dispositivo no permite leer GPS desde el navegador" })
      return
    }

    setLocating(true)
    setFeedback(null)
    let bestPosition: GeolocationPosition | null = null
    let finished = false
    let watchId: number | null = null
    const finish = (position: GeolocationPosition | null, error?: GeolocationPositionError) => {
      if (finished) return
      finished = true
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      window.clearTimeout(timeoutId)

      if (!position) {
        setLocating(false)
        setFeedback({ kind: "error", message: error ? getGeolocationErrorMessage(error) : "No se pudo obtener la ubicación. Revisa el permiso de GPS." })
        return
      }

      const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
      setLatitudeOverride(position.coords.latitude)
      setLongitudeOverride(position.coords.longitude)
      setAccuracyOverride(accuracy)
      setEnabledOverride(nextEnabled)
      setLocating(false)
      setFeedback({
        kind: "ok",
        message: accuracy != null && accuracy <= 50
          ? "Ubicación GPS precisa capturada. Guarda los cambios para activarla."
          : "Se guardó la mejor lectura disponible. Para mayor precisión, mantén el móvil dentro del local y vuelve a intentarlo.",
      })
    }

    const timeoutId = window.setTimeout(() => finish(bestPosition), 25000)
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy
        if (bestPosition == null || (Number.isFinite(accuracy) && accuracy < bestPosition.coords.accuracy)) {
          bestPosition = position
        }
        // On a phone, the browser often starts with a cell-tower estimate and
        // improves it shortly after enabling high-accuracy GPS.
        if (Number.isFinite(accuracy) && accuracy <= 50) finish(position)
      },
      (error) => finish(bestPosition, error),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
    )
  }

  async function handleToggle() {
    const next = !enabled
    setEnabledOverride(next)
    if (next && !hasLocation) captureLocation(next)
  }

  async function handleSave() {
    if (saving || !isDirty) return
    if (enabled && !hasLocation) {
      setFeedback({ kind: "error", message: "Captura la ubicación GPS del local antes de activar esta opción" })
      return
    }
    if (enabled && accuracyM == null) {
      setFeedback({ kind: "error", message: "Vuelve a capturar la ubicación con el botón Usar GPS actual antes de activarla" })
      return
    }
    if (enabled && accuracyM != null && accuracyM > 50 && !allowLowAccuracy) {
      setFeedback({ kind: "error", message: "La precisión GPS es baja. Captura el punto desde el interior del local o confirma que quieres guardar esta ubicación igualmente." })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateLocationConfig({
        enabled,
        latitude,
        longitude,
        accuracyM,
        radiusM,
      })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setEnabledOverride(null)
      setLatitudeOverride(undefined)
      setLongitudeOverride(undefined)
      setAccuracyOverride(undefined)
      setRadiusOverride(null)
      setAllowLowAccuracy(false)
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold text-stone-900">Activar ubicación</h3>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
          Beta
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Valida con GPS que los pedidos por QR se hagan cerca de la mesa. No afecta pedidos online ni delivery.
      </p>
      <p className="mt-3 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-medium leading-5 text-orange-800">
        Para registrar el punto exacto, abre esta pantalla desde un móvil estando dentro del local, activa la ubicación y espera a que el GPS se estabilice.
      </p>
      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
        Esta función está en beta. Una señal Wi‑Fi débil o un GPS defectuoso puede alterar la ubicación y la distancia calculada, provocando resultados incorrectos. Si notas algo extraño, desactívala temporalmente y revisa la ubicación registrada.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition ${
            enabled ? "bg-orange-500" : "bg-stone-200"
          }`}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm font-semibold text-stone-900">
          {enabled ? "Validación por ubicación activada" : "Validación por ubicación desactivada"}
        </span>
      </div>

      <div className="mt-6 grid max-w-xl gap-4 sm:grid-cols-[1fr_160px]">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Ubicación registrada</p>
          {hasLocation ? (
            <>
              <p className="mt-2 font-mono text-xs text-stone-700">{latitude.toFixed(6)}, {longitude.toFixed(6)}</p>
              <p className={`mt-2 text-xs font-semibold ${accuracyM != null && accuracyM <= 50 ? "text-emerald-700" : "text-amber-700"}`}>
                {accuracyM != null ? `Precisión estimada: ±${Math.round(accuracyM)} m` : "Precisión no registrada: vuelve a capturar el GPS"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs font-medium text-stone-500">Sin ubicación GPS guardada.</p>
          )}
          <button
            type="button"
            onClick={() => captureLocation(true)}
            disabled={locating}
            className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locating ? "Buscando GPS del móvil..." : "Capturar ubicación desde este móvil"}
          </button>
          {accuracyM != null && accuracyM > 50 && (
            <label className="mt-3 flex items-start gap-2 text-[11px] font-medium leading-4 text-amber-800">
              <input type="checkbox" checked={allowLowAccuracy} onChange={(event) => setAllowLowAccuracy(event.target.checked)} className="mt-0.5 accent-orange-500" />
              Confirmo que la ubicación fue capturada dentro del local y acepto este margen.
            </label>
          )}
        </div>

        <label className="block rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs font-bold uppercase tracking-wider text-stone-500">
          Radio permitido
          <input
            type="number"
            min={30}
            max={1000}
            step={10}
            value={radiusM}
            onChange={(event) => setRadiusOverride(Number(event.target.value))}
            className="mt-3 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-stone-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
          />
          <span className="mt-2 block text-[11px] font-medium normal-case leading-4 tracking-normal text-stone-500">
            Metros. Recomendado: 120.
          </span>
        </label>
      </div>

      {feedback && (
        <p
          className={`mt-5 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || locating || !isDirty}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs font-medium text-stone-400">Sin cambios.</span>
        )}
      </div>
    </section>
  )
}

type OrderHandlingSectionProps = {
  restaurant: Restaurant | null
  onSaved: () => void
}

function OrderDestinationSection({ restaurant, onSaved }: OrderHandlingSectionProps) {
  const initial: OrderDestination = restaurant?.order_destination ?? "waiter"

  const [override, setOverride] = useState<OrderDestination | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const destination: OrderDestination = override ?? initial
  const isDirty = destination !== initial

  async function handleSave() {
    if (saving || !isDirty) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateOrderDestination({ destination })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setOverride(null)
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Destino de pedidos</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Elegí si los pedidos pasan primero por un mesero o llegan directo a cocina.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOverride("waiter")}
          className={`rounded-2xl border p-4 text-left transition ${
            destination === "waiter" ? "border-orange-500 ring-2 ring-orange-200" : "border-stone-200 hover:border-stone-300"
          }`}
        >
          <p className="text-sm font-bold text-stone-900">Mesero</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Los pedidos inician en &quot;Nuevo&quot; y el mesero los confirma para que pasen a cocina.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setOverride("kitchen")}
          className={`rounded-2xl border p-4 text-left transition ${
            destination === "kitchen" ? "border-orange-500 ring-2 ring-orange-200" : "border-stone-200 hover:border-stone-300"
          }`}
        >
          <p className="text-sm font-bold text-stone-900">Cocina directa</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Los pedidos llegan en &quot;En preparación&quot; sin pasar por el mesero.
          </p>
        </button>
      </div>

      {feedback && (
        <p
          className={`mt-5 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs font-medium text-stone-400">Sin cambios.</span>
        )}
      </div>
    </section>
  )
}

const OUTPUT_OPTIONS: Array<{ id: OutputMode; title: string; description: string }> = [
  {
    id: "none",
    title: "Ninguna",
    description: "No se envía el pedido a impresora ni pantalla. Los meseros lo gestionan desde el panel.",
  },
  {
    id: "printer",
    title: "Impresora térmica",
    description: "Bluetooth (58/80mm). Cocina recibe un ticket cuando el pedido entra en preparación.",
  },
  {
    id: "screen",
    title: "Pantalla en cocina",
    description: "Vista kiosko en /screen para abrir en una TV o tablet en cocina.",
  },
]

function OutputModeSection({ restaurant, onSaved }: OrderHandlingSectionProps) {
  const initialMode: OutputMode = restaurant?.output_mode ?? "none"
  const initialDeviceName = restaurant?.printer_bluetooth_name ?? ""

  const [modeOverride, setModeOverride] = useState<OutputMode | null>(null)
  const [deviceNameOverride, setDeviceNameOverride] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const mode = modeOverride ?? initialMode
  const deviceName = deviceNameOverride ?? initialDeviceName
  const isDirty =
    mode !== initialMode ||
    (mode === "printer" &&
      deviceNameOverride !== null &&
      deviceNameOverride.trim() !== initialDeviceName.trim())

  async function handleSave() {
    if (saving || !isDirty) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateOutputMode({
        mode,
        bluetoothName: mode === "printer" ? deviceName.trim() : null,
      })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setModeOverride(null)
      setDeviceNameOverride(null)
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Salida del pedido</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Elegí cómo recibe cocina los pedidos cuando entran en preparación.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {OUTPUT_OPTIONS.map((option) => {
          const selected = mode === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setModeOverride(option.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                selected ? "border-orange-500 ring-2 ring-orange-200" : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <p className="text-sm font-bold text-stone-900">{option.title}</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">{option.description}</p>
            </button>
          )
        })}
      </div>

      {mode === "printer" && (
        <div className="mt-6 max-w-md">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">
            Nombre del dispositivo (opcional)
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceNameOverride(e.target.value)}
            placeholder="Ej. POS-58, MTP-II, RPP02N…"
            maxLength={80}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
          />
          <p className="mt-2 text-[11px] leading-4 text-stone-500">
            El emparejamiento se hace desde <span className="font-mono">/admin/printer</span> en el dispositivo del local
            (tablet o PC con Chrome/Edge). Si dejás vacío, vas a elegir la impresora desde el diálogo del navegador.
          </p>
        </div>
      )}

      {mode === "screen" && (
        <div className="mt-6 max-w-md rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs leading-5 text-stone-600">
            Abrí <span className="font-mono font-semibold">/screen</span> en la TV o tablet de cocina. Los pedidos
            van a aparecer ahí en grande cuando entren en preparación.
          </p>
        </div>
      )}

      {feedback && (
        <p
          className={`mt-5 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs font-medium text-stone-400">Sin cambios.</span>
        )}
      </div>
    </section>
  )
}

const RESERVATION_OPTIONS: Array<{ id: ReservationContactType; title: string; description: string }> = [
  {
    id: "none",
    title: "Ninguna",
    description: "No se aceptan reservas. Las mesas no se bloquean por horario.",
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "El cliente coordina la reserva por WhatsApp y el local la registra. La mesa se bloquea durante la reserva.",
  },
]

function ReservationSection({ restaurant, onSaved }: OrderHandlingSectionProps) {
  const initialType: ReservationContactType = restaurant?.reservation_contact_type ?? "none"
  const initialWhatsapp = restaurant?.reservation_whatsapp ?? ""
  const initialDuration = restaurant?.reservation_duration_minutes ?? 120

  const [typeOverride, setTypeOverride] = useState<ReservationContactType | null>(null)
  const [whatsappOverride, setWhatsappOverride] = useState<string | null>(null)
  const [durationOverride, setDurationOverride] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const contactType = typeOverride ?? initialType
  const whatsapp = whatsappOverride ?? initialWhatsapp
  const duration = durationOverride ?? initialDuration
  const isDirty =
    contactType !== initialType ||
    (contactType === "whatsapp" &&
      ((whatsappOverride !== null && whatsappOverride.trim() !== initialWhatsapp.trim()) ||
        (durationOverride !== null && durationOverride !== initialDuration)))

  async function handleSave() {
    if (saving || !isDirty) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateReservationConfig({
        contactType,
        whatsapp: contactType === "whatsapp" ? whatsapp.trim() : null,
        durationMinutes: duration,
      })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      onSaved()
      setTypeOverride(null)
      setWhatsappOverride(null)
      setDurationOverride(null)
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Reservas de mesas</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Elegí cómo se coordinan las reservas. Cuando una mesa está reservada, se bloquea su QR durante el horario.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {RESERVATION_OPTIONS.map((option) => {
          const selected = contactType === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTypeOverride(option.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                selected ? "border-orange-500 ring-2 ring-orange-200" : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <p className="text-sm font-bold text-stone-900">{option.title}</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">{option.description}</p>
            </button>
          )
        })}
      </div>

      {contactType === "whatsapp" && (
        <div className="mt-6 grid max-w-md gap-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Número de WhatsApp
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsappOverride(e.target.value)}
              placeholder="+56912345678"
              maxLength={20}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
            />
            <p className="mt-2 text-[11px] leading-4 text-stone-500">
              Formato internacional, con código de país. Ej. <span className="font-mono">+56912345678</span>.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Duración por defecto (minutos)
            </label>
            <input
              type="number"
              min={15}
              max={720}
              step={15}
              value={duration}
              onChange={(e) => setDurationOverride(Number(e.target.value))}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
            />
            <p className="mt-2 text-[11px] leading-4 text-stone-500">
              Cuánto dura una reserva (y el bloqueo de la mesa) salvo que se indique otra cosa. Ej. 120 = 2 horas.
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <p
          className={`mt-5 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {!isDirty && !saving && (
          <span className="text-xs font-medium text-stone-400">Sin cambios.</span>
        )}
      </div>
    </section>
  )
}

export default function AdminSettingsPage() {
  const { restaurant, loading, refresh } = useRestaurant()
  const { categories } = useCategories({ page: 1, pageSize: 4 })
  const { products } = useProducts({ page: 1, pageSize: 8 })

  const [selectedOverride, setSelectedOverride] = useState<MenuTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const selected: MenuTemplate = selectedOverride ?? restaurant?.menu_template ?? "noche"

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateMenuTemplate({ template: selected })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
      refresh()
      setFeedback({ kind: "ok", message: "Cambios guardados" })
    } finally {
      setSaving(false)
    }
  }

  const currentTemplate = restaurant?.menu_template ?? "noche"
  const isDirty = selected !== currentTemplate

  const previewCategories = categories.slice(0, 3)
  const previewProducts = previewCategories
    .map((cat) => products.find((p) => p.category_id === cat.id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">Ajustes</h2>
        <p className="mt-1 text-sm text-stone-500">
          Personalizá el nombre del restaurante y el template del menú.
        </p>
      </section>

      <RestaurantNameSection
        currentName={restaurant?.restaurant_name}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <RestaurantLogoSection
        currentLogo={restaurant?.restaurant_logo}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <RestaurantCitySection
        currentCity={restaurant?.restaurant_city}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <DeliverySection
        restaurant={restaurant ?? null}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <LocationSection
        restaurant={restaurant ?? null}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <OrderDestinationSection
        restaurant={restaurant ?? null}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <OutputModeSection
        restaurant={restaurant ?? null}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <ReservationSection
        restaurant={restaurant ?? null}
        onSaved={() => {
          if (restaurant) invalidateCache(`restaurant-${restaurant.id}`)
          refresh()
        }}
      />

      <PaymentGatewaySection />

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <h3 className="text-lg font-bold text-stone-900">Template del menú</h3>
            <p className="mt-1 text-xs font-medium text-stone-500">
              Tocá un template para previsualizarlo a la derecha.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {MENU_TEMPLATES.map((template) => {
                const isSelected = selected === template.id
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedOverride(template.id)}
                    className={`overflow-hidden rounded-2xl border text-left transition ${
                      isSelected
                        ? "border-orange-500 ring-2 ring-orange-200"
                        : "border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    <div className="relative h-24 w-full" style={{ background: template.swatch }}>
                      {isSelected && (
                        <span className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M5 12l5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-stone-900">{template.label}</p>
                      <p className="mt-1 text-xs leading-5 text-stone-500">{template.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {feedback && (
              <p
                className={`mt-5 rounded-lg px-3 py-2 text-xs font-medium ${
                  feedback.kind === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {feedback.message}
              </p>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading || !isDirty}
                className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              {!isDirty && !saving && (
                <span className="text-xs font-medium text-stone-400">Ya estás usando este template.</span>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">Vista previa</p>
            <PreviewBody
              template={selected}
              restaurantName={restaurant?.restaurant_name}
              restaurantLogo={restaurant?.restaurant_logo}
              previewCategories={previewCategories}
              previewProducts={previewProducts}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
