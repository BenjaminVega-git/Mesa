"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ClipboardList,
  CreditCard,
  MapPin,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
  User,
  X,
} from "lucide-react"
import { createSupabaseAnonClient } from "@/lib/supabase/anon"
import { ProductImage } from "@/components/customer/ProductImage"
import type { FulfillmentType, MenuTemplate } from "@/types/restaurant"

type Variant = {
  id: number
  variant_name: string
  variant_description: string | null
  variant_price: number
  variant_image: string | null
  stock_out: boolean
}

type IngredientOption = {
  ingredient_id: number
  name: string
  kind: "removable" | "extra"
  extra_price: number
}

type MenuOption = { id: number; name: string; extra_price: number }

type Product = {
  id: number
  product_name: string
  product_description: string | null
  product_price: number
  product_image: string | null
  image_recortada: boolean
  category_id: number
  status_id: number
  stock_out: boolean
  category_name: string | null
  variants: Variant[]
  ingredient_options: IngredientOption[]
  menu_options: MenuOption[]
}

type Restaurant = {
  id: number
  restaurant_name: string
  restaurant_logo: string | null
  restaurant_city: string | null
  menu_template: MenuTemplate
  delivery_slug: string
}

export type DeliveryMenuData = {
  restaurant: Restaurant
  categories: Array<{ id: number; category_name: string }>
  products: Product[]
}

type CartChoice = { id: number; name: string; action?: "remove" | "add"; extraPrice: number }

type CartItem = {
  key: string
  productId: number
  productName: string
  variantId: number | null
  variantName: string | null
  image: string | null
  unitPrice: number
  quantity: number
  ingredientChoices: CartChoice[]
  menuOptionChoices: CartChoice[]
  notes: string
}

type DeliveryForm = { name: string; phone: string; address: string; reference: string; email: string }
type PaymentMethod = "online" | "pay_at_store"
type TrackedDeliveryOrder = { id: number; phone: string; total: number; fulfillmentType: FulfillmentType; createdAt: string }
type DeliveryOrderStatus = {
  id: number
  total: number
  status_id: number
  status_name: string
  created_at: string
  fulfillment_type: FulfillmentType
  customer_name: string | null
  address: string | null
  reference: string | null
  payment_method: PaymentMethod | null
  items: Array<{ name: string; variant_name: string | null; quantity: number; notes: string | null }>
}

const EMPTY_FORM: DeliveryForm = { name: "", phone: "", address: "", reference: "", email: "" }
const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  flow: "Flow",
  mercadopago: "Mercado Pago",
  transbank: "Transbank Webpay",
  simulated: "Pago de prueba",
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString("es-CL")}`
}

function cartKey(item: Omit<CartItem, "key" | "quantity">) {
  const ingredients = item.ingredientChoices.map((c) => `${c.id}:${c.action}`).sort().join(",")
  const options = item.menuOptionChoices.map((c) => c.id).sort((a, b) => a - b).join(",")
  return [item.productId, item.variantId ?? 0, ingredients, options, item.notes.trim()].join("|")
}

function newRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16)
  })
}

function mergeTrackedOrder(orders: TrackedDeliveryOrder[], order: TrackedDeliveryOrder) {
  return [order, ...orders.filter((entry) => entry.id !== order.id)].slice(0, 6)
}

export function DeliveryMenuClient({
  data,
  paymentProvider,
  deliveryOptions,
}: {
  data: DeliveryMenuData
  paymentProvider: string | null
  deliveryOptions: { home_delivery?: boolean; pickup?: boolean }
}) {
  const { restaurant, categories, products } = data
  const storageKey = `mesa-delivery-cart:${restaurant.delivery_slug}`
  const [cart, setCart] = useState<CartItem[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [form, setForm] = useState<DeliveryForm>(EMPTY_FORM)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const defaultFulfillment: FulfillmentType = deliveryOptions.home_delivery ? "home_delivery" : "pickup"
  const serviceLabel = deliveryOptions.home_delivery && deliveryOptions.pickup
    ? "Delivery y retiro"
    : deliveryOptions.pickup
      ? "Retiro en tienda"
      : "Delivery"
  const [completed, setCompleted] = useState<{ id: number; total: number; fulfillmentType: FulfillmentType; phone: string } | null>(null)
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(defaultFulfillment)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentProvider ? "online" : "pay_at_store")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<number | "all">("all")
  const [hydrated, setHydrated] = useState(false)
  const [trackedOrders, setTrackedOrders] = useState<TrackedDeliveryOrder[]>([])
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusOrder, setStatusOrder] = useState<TrackedDeliveryOrder | null>(null)
  const [orderStatus, setOrderStatus] = useState<DeliveryOrderStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState("")
  const requestIdRef = useRef<string | null>(null)
  const pendingKey = `mesa-delivery-payment:${restaurant.delivery_slug}`
  const trackingKey = `mesa-delivery-orders:${restaurant.delivery_slug}`

  const saveTrackedOrder = useCallback((order: TrackedDeliveryOrder) => {
    setTrackedOrders((current) => {
      const next = mergeTrackedOrder(current, order)
      localStorage.setItem(trackingKey, JSON.stringify(next))
      return next
    })
  }, [trackingKey])

  const loadOrderStatus = useCallback(async (order: TrackedDeliveryOrder, silent = false) => {
    if (!silent) {
      setStatusLoading(true)
      setStatusError("")
    }
    try {
      const supabase = createSupabaseAnonClient()
      const { data: result, error: rpcError } = await supabase.rpc("get_delivery_order_status", {
        p_slug: restaurant.delivery_slug,
        p_order_id: order.id,
        p_customer_phone: order.phone,
      })
      if (rpcError) throw rpcError
      setOrderStatus(result as DeliveryOrderStatus)
      setStatusError("")
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No pudimos cargar el estado"
      if (!silent) setStatusError(message)
    } finally {
      if (!silent) setStatusLoading(false)
    }
  }, [restaurant.delivery_slug])

  const openOrderStatus = useCallback((order: TrackedDeliveryOrder) => {
    setStatusOrder(order)
    setStatusOpen(true)
    setOrderStatus(null)
    setStatusError("")
    void loadOrderStatus(order)
  }, [loadOrderStatus])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratacion unica del carrito persistido
      if (saved) setCart(JSON.parse(saved) as CartItem[])
    } catch {
      localStorage.removeItem(storageKey)
    }
    try {
      const savedOrders = localStorage.getItem(trackingKey)
      if (savedOrders) setTrackedOrders(JSON.parse(savedOrders) as TrackedDeliveryOrder[])
    } catch {
      localStorage.removeItem(trackingKey)
    }
    setHydrated(true)

    const params = new URLSearchParams(window.location.search)
    const payment = params.get("payment")
    if (payment === "exito") {
      const pending = localStorage.getItem(pendingKey)
      let parsed: { id: number; total: number; fulfillmentType?: FulfillmentType; phone?: string; createdAt?: string } | null = null
      try {
        parsed = pending ? JSON.parse(pending) as { id: number; total: number; fulfillmentType?: FulfillmentType; phone?: string; createdAt?: string } : null
      } catch {
        localStorage.removeItem(pendingKey)
      }
      const tracked = parsed?.phone ? {
        id: parsed.id,
        phone: parsed.phone,
        total: parsed.total ?? 0,
        fulfillmentType: parsed.fulfillmentType ?? defaultFulfillment,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
      } : null
      if (tracked) saveTrackedOrder(tracked)
      setCompleted({
        id: parsed?.id ?? (Number(params.get("order")) || 0),
        total: parsed?.total ?? 0,
        fulfillmentType: parsed?.fulfillmentType ?? defaultFulfillment,
        phone: parsed?.phone ?? "",
      })
      localStorage.removeItem(pendingKey)
      window.history.replaceState({}, "", window.location.pathname)
    } else if (payment === "rechazado" || payment === "cancelado" || payment === "error") {
      setCheckoutOpen(true)
      setError("El pago no se completó. Puedes intentarlo nuevamente o pagar al retirar.")
      window.history.replaceState({}, "", window.location.pathname)
    } else if (payment === "pendiente") {
      setCompleted({ id: Number(params.get("order")) || 0, total: 0, fulfillmentType: defaultFulfillment, phone: "" })
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [defaultFulfillment, pendingKey, saveTrackedOrder, storageKey, trackingKey])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(storageKey, JSON.stringify(cart))
  }, [cart, hydrated, storageKey])

  useEffect(() => {
    if (!statusOpen || !statusOrder) return
    const interval = window.setInterval(() => {
      void loadOrderStatus(statusOrder, true)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [loadOrderStatus, statusOpen, statusOrder])

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("es")
    return products.filter((product) => {
      const matchesCategory = activeCategory === "all" || product.category_id === activeCategory
      const matchesSearch = !query || `${product.product_name} ${product.product_description ?? ""}`.toLocaleLowerCase("es").includes(query)
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, products, searchQuery])

  const visibleCategories = categories.filter((category) => products.some((product) => product.category_id === category.id))

  const quantity = cart.reduce((sum, item) => sum + item.quantity, 0)
  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  function addItem(item: Omit<CartItem, "key" | "quantity">, quantityToAdd: number) {
    requestIdRef.current = null
    const key = cartKey(item)
    setCart((current) => {
      const found = current.find((entry) => entry.key === key)
      if (found) {
        return current.map((entry) =>
          entry.key === key ? { ...entry, quantity: Math.min(20, entry.quantity + quantityToAdd) } : entry
        )
      }
      return [...current, { ...item, key, quantity: quantityToAdd }]
    })
    setSelected(null)
  }

  function changeQuantity(key: string, delta: number) {
    requestIdRef.current = null
    setCart((current) =>
      current
        .map((item) => (item.key === key ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    )
  }

  async function submitOrder() {
    if (sending || cart.length === 0) return
    if (form.name.trim().length < 2 || form.phone.trim().length < 7) {
      setError("Completa tu nombre y teléfono para continuar.")
      return
    }
    if (fulfillmentType === "home_delivery" && form.address.trim().length < 5) {
      setError("Ingresa la dirección donde debemos entregar el pedido.")
      return
    }
    if (paymentMethod === "online" && paymentProvider === "flow" && !form.email.trim()) {
      setError("Ingresa tu email para recibir el comprobante de Flow.")
      return
    }

    setSending(true)
    setError("")
    const requestId = requestIdRef.current ?? newRequestId()
    requestIdRef.current = requestId
    try {
      const supabase = createSupabaseAnonClient()
      const { data: result, error: rpcError } = await supabase.rpc("create_delivery_order", {
        p_slug: restaurant.delivery_slug,
        p_items: cart.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity,
          notes: item.notes.trim() || null,
          ingredient_choices: item.ingredientChoices.map((choice) => ({
            ingredient_id: choice.id,
            action: choice.action,
          })),
          menu_option_choices: item.menuOptionChoices.map((choice) => ({ option_id: choice.id })),
        })),
        p_customer_name: form.name.trim(),
        p_customer_phone: form.phone.trim(),
        p_address: form.address.trim(),
        p_reference: form.reference.trim() || null,
        p_request_id: requestId,
        p_payment_method: paymentMethod,
        p_fulfillment_type: fulfillmentType,
      })

      if (rpcError) throw rpcError
      const order = result as unknown as { id: number; total: number }

      if (paymentMethod === "online") {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payment-create-delivery-charge`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              slug: restaurant.delivery_slug,
              orderId: order.id,
              requestId,
              payerEmail: form.email.trim() || undefined,
            }),
          }
        )
        const payment = await response.json().catch(() => null) as { checkoutUrl?: string; error?: string } | null
        if (!response.ok || !payment?.checkoutUrl) throw new Error(payment?.error ?? "No se pudo iniciar el pago")

        localStorage.setItem(pendingKey, JSON.stringify({
          id: order.id,
          total: order.total,
          fulfillmentType,
          phone: form.phone.trim(),
          createdAt: new Date().toISOString(),
        }))
        setCart([])
        localStorage.removeItem(storageKey)
        window.location.assign(payment.checkoutUrl)
        return
      }

      const trackedOrder = {
        id: order.id,
        phone: form.phone.trim(),
        total: order.total,
        fulfillmentType,
        createdAt: new Date().toISOString(),
      }
      saveTrackedOrder(trackedOrder)
      setCompleted({ id: order.id, total: order.total, fulfillmentType, phone: form.phone.trim() })
      requestIdRef.current = null
      setCart([])
      setForm(EMPTY_FORM)
      setCheckoutOpen(false)
      setCartOpen(false)
      localStorage.removeItem(storageKey)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No pudimos enviar el pedido"
      setError(message.includes("rate") ? "Espera un momento y vuelve a intentarlo." : message)
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-black [font-family:var(--font-manrope)] text-[#fafafa] sm:py-4">
      <section className="relative mx-auto min-h-screen w-full overflow-hidden bg-[#0a0a0b] pb-28 shadow-[0_30px_80px_rgba(0,0,0,0.5)] sm:min-h-[calc(100vh-32px)] sm:max-w-[440px] sm:rounded-[38px] sm:border-[10px] sm:border-[#050506]">
      <header className="px-4 pt-5">
        <div className="flex items-center gap-3">
          {restaurant.restaurant_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.restaurant_logo}
              alt={restaurant.restaurant_name}
              className="h-11 w-11 rounded-full border border-[#fb923c]/60 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fb923c] text-lg font-black text-[#1a1a1a]">
              {restaurant.restaurant_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate [font-family:var(--font-grotesk)] text-[21px] font-extrabold">{restaurant.restaurant_name}</h1>
            {restaurant.restaurant_city ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-[#a1a1aa]">
                <MapPin className="h-3.5 w-3.5" /> {serviceLabel} · {restaurant.restaurant_city}
              </p>
            ) : <p className="mt-0.5 text-xs text-[#a1a1aa]">{serviceLabel}</p>}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 mt-4 border-b border-[#1f1f23] bg-[#0a0a0b]/95 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex h-11 items-center gap-2.5 rounded-2xl border border-[#27272a] bg-[#18181b] px-3.5">
          <Search className="h-[18px] w-[18px] text-[#a1a1aa]" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar platos, ingredientes…" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#71717a]" />
          {searchQuery ? <button type="button" onClick={() => setSearchQuery("")} aria-label="Limpiar búsqueda" className="text-[#a1a1aa]"><X className="h-4 w-4" /></button> : null}
        </div>
        {trackedOrders.length ? (
          <button
            type="button"
            onClick={() => openOrderStatus(trackedOrders[0])}
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-[#2f2f35] bg-[#18181b] px-3.5 py-3 text-left text-sm font-bold text-[#fafafa]"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <ClipboardList className="h-4 w-4 shrink-0 text-[#fb923c]" />
              <span className="truncate">Mis pedidos online</span>
            </span>
            <span className="rounded-full bg-[#27272a] px-2.5 py-1 text-xs text-[#d4d4d8]">#{trackedOrders[0].id}</span>
          </button>
        ) : null}
        <nav className="mt-3 flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setActiveCategory("all")} className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold ${activeCategory === "all" ? "bg-[#fb923c] text-[#1a1a1a]" : "border border-[#27272a] bg-[#18181b] text-[#d4d4d8]"}`}>Todos</button>
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold ${activeCategory === category.id ? "bg-[#fb923c] text-[#1a1a1a]" : "border border-[#27272a] bg-[#18181b] text-[#d4d4d8]"}`}
            >
              {category.category_name}
            </button>
          ))}
        </nav>
      </div>

      <div className="px-4 pt-4">
        {visibleProducts.length === 0 ? (
          <p className="py-20 text-center text-sm font-semibold text-[#71717a]">No hay productos disponibles.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
                  {visibleProducts.map((product) => {
                    const soldOut = product.stock_out || (
                      product.variants.length > 0 && product.variants.every((variant) => variant.stock_out)
                    )
                    const fromPrice = product.variants.length
                      ? Math.min(...product.variants.map((variant) => variant.variant_price))
                      : product.product_price
                    return (
                      <button
                        key={product.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => setSelected(product)}
                        className="group flex min-h-[128px] w-full items-stretch overflow-hidden rounded-[26px] border border-[#1f1f23] bg-[#161618] text-left transition active:scale-[0.985] disabled:opacity-55"
                      >
                        <ProductImage src={product.product_image} alt={product.product_name} hasBackground={!product.image_recortada} fade="right" className="w-[128px] shrink-0" />
                        <div className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pl-1 pr-2">
                          <h3 className="line-clamp-2 [font-family:var(--font-grotesk)] text-[16px] font-bold leading-tight">{product.product_name}</h3>
                          {product.product_description ? (
                            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[#a1a1aa]">{product.product_description}</p>
                          ) : null}
                          <p className="mt-2 text-[17px] font-extrabold text-[#fb923c]">
                            {product.variants.length ? "Desde " : ""}{money(fromPrice)}
                          </p>
                        </div>
                        <span className="my-auto mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fb923c] text-[22px] font-light text-[#1a1a1a]">+</span>
                      </button>
                    )
                  })}
          </div>
        )}
      </div>

      {quantity > 0 ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-lg bg-stone-950 px-5 py-4 text-white shadow-2xl"
        >
          <span className="flex items-center gap-3 text-sm font-bold">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-500 px-2 text-xs">{quantity}</span>
            Ver pedido
          </span>
          <span className="font-black">{money(total)}</span>
        </button>
      ) : null}

      {selected ? <ProductDialog product={selected} onClose={() => setSelected(null)} onAdd={addItem} /> : null}

      {cartOpen ? (
        <CartDialog
          cart={cart}
          total={total}
          onClose={() => setCartOpen(false)}
          onChangeQuantity={changeQuantity}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); setError("") }}
        />
      ) : null}

      {checkoutOpen ? (
        <CheckoutDialog
          form={form}
          total={total}
          sending={sending}
          error={error}
          paymentProvider={paymentProvider}
          paymentMethod={paymentMethod}
          fulfillmentType={fulfillmentType}
          deliveryOptions={deliveryOptions}
          onFulfillmentTypeChange={setFulfillmentType}
          onPaymentMethodChange={setPaymentMethod}
          onChange={setForm}
          onBack={() => { setCheckoutOpen(false); setCartOpen(true); setError("") }}
          onClose={() => setCheckoutOpen(false)}
          onSubmit={submitOrder}
        />
      ) : null}

      {completed ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-sm rounded-lg bg-white p-7 text-center text-stone-950 shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-2xl font-black">Pedido recibido</h2>
            <p className="mt-2 text-sm text-stone-600">
              {paymentMethod === "online"
                ? `Pago recibido. Tu pedido #${completed.id} ya fue enviado al restaurante.`
                : completed.fulfillmentType === "pickup"
                  ? `Tu pedido #${completed.id} fue enviado. Pagarás al retirarlo en tienda.`
                  : `Tu pedido #${completed.id} fue enviado. Pagarás al recibirlo.`}
            </p>
            {completed.total > 0 ? <p className="mt-4 text-xl font-black">{money(completed.total)}</p> : null}
            {completed.phone ? (
              <button
                type="button"
                onClick={() => openOrderStatus({
                  id: completed.id,
                  phone: completed.phone,
                  total: completed.total,
                  fulfillmentType: completed.fulfillmentType,
                  createdAt: new Date().toISOString(),
                })}
                className="mt-5 w-full rounded-lg border border-stone-200 px-4 py-3 text-sm font-bold text-stone-950"
              >
                Ver estado del pedido
              </button>
            ) : null}
            <button type="button" onClick={() => setCompleted(null)} className="mt-6 w-full rounded-lg bg-stone-950 px-4 py-3 text-sm font-bold text-white">
              Volver al menú
            </button>
          </section>
        </div>
      ) : null}
      {statusOpen ? (
        <DeliveryStatusDialog
          orders={trackedOrders}
          selectedOrder={statusOrder}
          status={orderStatus}
          loading={statusLoading}
          error={statusError}
          onSelect={openOrderStatus}
          onRefresh={() => statusOrder ? void loadOrderStatus(statusOrder) : undefined}
          onClose={() => setStatusOpen(false)}
        />
      ) : null}
      </section>
    </main>
  )
}

function statusStep(statusName: string | undefined) {
  const normalized = (statusName ?? "").toLocaleLowerCase("es")
  if (normalized.includes("pendiente")) return 0
  if (normalized.includes("nuevo")) return 1
  if (normalized.includes("prepar")) return 2
  if (normalized.includes("listo")) return 3
  if (normalized.includes("pagado")) return 4
  if (normalized.includes("cancel")) return -1
  return 1
}

function DeliveryStatusDialog({
  orders,
  selectedOrder,
  status,
  loading,
  error,
  onSelect,
  onRefresh,
  onClose,
}: {
  orders: TrackedDeliveryOrder[]
  selectedOrder: TrackedDeliveryOrder | null
  status: DeliveryOrderStatus | null
  loading: boolean
  error: string
  onSelect: (order: TrackedDeliveryOrder) => void
  onRefresh: () => void
  onClose: () => void
}) {
  const step = statusStep(status?.status_name)
  const steps = ["Recibido", "En cocina", "Listo", "Cerrado"]
  const fulfillment = (status?.fulfillment_type ?? selectedOrder?.fulfillmentType) === "pickup" ? "Retiro en tienda" : "A domicilio"

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <section className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 text-stone-950 shadow-2xl sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Mis pedidos online</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onRefresh} disabled={!selectedOrder || loading} className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 disabled:opacity-50" aria-label="Actualizar">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {orders.length > 1 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => onSelect(order)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${selectedOrder?.id === order.id ? "border-orange-400 bg-orange-50 text-orange-700" : "border-stone-200 text-stone-600"}`}
              >
                Pedido #{order.id}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        {!status && !error ? <p className="mt-8 text-center text-sm font-semibold text-stone-500">{loading ? "Cargando estado..." : "Selecciona un pedido para ver su estado."}</p> : null}

        {status ? (
          <div className="mt-5">
            <div className="rounded-lg border border-stone-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-stone-500">Pedido #{status.id}</p>
                  <h3 className="mt-1 text-xl font-black">{status.status_name}</h3>
                  <p className="mt-1 text-sm font-semibold text-stone-500">{fulfillment}</p>
                </div>
                <b className="shrink-0 text-lg">{money(status.total)}</b>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-2">
                {steps.map((label, index) => {
                  const active = step === -1 ? false : index <= Math.max(0, step - 1)
                  return (
                    <div key={label} className="min-w-0">
                      <div className={`h-2 rounded-full ${active ? "bg-orange-500" : "bg-stone-200"}`} />
                      <p className={`mt-2 text-[11px] font-black leading-tight ${active ? "text-stone-950" : "text-stone-400"}`}>{label}</p>
                    </div>
                  )
                })}
              </div>

              {status.fulfillment_type === "home_delivery" && status.address ? <p className="mt-5 text-sm text-stone-600">{status.address}</p> : null}
              {status.reference ? <p className="mt-2 text-sm italic text-stone-500">{status.reference}</p> : null}
            </div>

            <div className="mt-4 divide-y divide-stone-100 rounded-lg border border-stone-200">
              {status.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex gap-3 p-3">
                  <b className="text-sm">{item.quantity}x</b>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{item.name}{item.variant_name ? ` · ${item.variant_name}` : ""}</p>
                    {item.notes ? <p className="mt-1 text-xs italic text-stone-500">{item.notes}</p> : null}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs font-semibold text-stone-400">Se actualiza automáticamente cada pocos segundos.</p>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function ProductDialog({
  product,
  onClose,
  onAdd,
}: {
  product: Product
  onClose: () => void
  onAdd: (item: Omit<CartItem, "key" | "quantity">, quantity: number) => void
}) {
  const availableVariants = product.variants.filter((variant) => !variant.stock_out)
  const [variantId, setVariantId] = useState<number | null>(availableVariants[0]?.id ?? null)
  const [removed, setRemoved] = useState<number[]>([])
  const [extras, setExtras] = useState<number[]>([])
  const [menuOptions, setMenuOptions] = useState<number[]>([])
  const [notes, setNotes] = useState("")
  const [quantity, setQuantity] = useState(1)
  const variant = availableVariants.find((entry) => entry.id === variantId) ?? null

  const ingredientChoices: CartChoice[] = product.ingredient_options
    .filter((option) => removed.includes(option.ingredient_id) || extras.includes(option.ingredient_id))
    .map((option) => ({
      id: option.ingredient_id,
      name: option.kind === "removable" ? `Sin ${option.name}` : `Extra ${option.name}`,
      action: option.kind === "removable" ? "remove" : "add",
      extraPrice: option.kind === "extra" ? option.extra_price : 0,
    }))
  const selectedMenuOptions: CartChoice[] = product.menu_options
    .filter((option) => menuOptions.includes(option.id))
    .map((option) => ({ id: option.id, name: option.name, extraPrice: option.extra_price }))
  const extrasTotal = [...ingredientChoices, ...selectedMenuOptions].reduce((sum, choice) => sum + choice.extraPrice, 0)
  const unitPrice = (variant?.variant_price ?? product.product_price) + extrasTotal
  const image = variant?.variant_image ?? product.product_image

  function toggle(value: number, setValues: React.Dispatch<React.SetStateAction<number[]>>) {
    setValues((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <section className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white text-stone-950 sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center" aria-label="Cerrar"><X /></button>
          <p className="text-sm font-bold">Personalizar producto</p>
          <span className="h-9 w-9" />
        </div>
        <div className="p-5">
          {image ? (
            <div className="mb-4 h-52 bg-stone-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-full w-full object-contain" />
            </div>
          ) : null}
          <h2 className="text-2xl font-black">{product.product_name}</h2>
          {product.product_description ? <p className="mt-2 text-sm leading-6 text-stone-600">{product.product_description}</p> : null}

          {availableVariants.length > 0 ? (
            <ChoiceSection title="Elige una variante">
              {availableVariants.map((entry) => (
                <label key={entry.id} className="flex cursor-pointer items-start justify-between gap-3 border-b border-stone-100 py-3 last:border-0">
                  <span><span className="block text-sm font-bold">{entry.variant_name}</span>{entry.variant_description ? <span className="mt-0.5 block text-xs text-stone-500">{entry.variant_description}</span> : null}</span>
                  <span className="flex items-center gap-3"><b className="text-sm">{money(entry.variant_price)}</b><input type="radio" checked={variantId === entry.id} onChange={() => setVariantId(entry.id)} /></span>
                </label>
              ))}
            </ChoiceSection>
          ) : null}

          {product.ingredient_options.filter((option) => option.kind === "removable").length > 0 ? (
            <ChoiceSection title="Quitar ingredientes">
              {product.ingredient_options.filter((option) => option.kind === "removable").map((option) => (
                <CheckChoice key={option.ingredient_id} checked={removed.includes(option.ingredient_id)} label={`Sin ${option.name}`} price={0} onChange={() => toggle(option.ingredient_id, setRemoved)} />
              ))}
            </ChoiceSection>
          ) : null}

          {product.ingredient_options.filter((option) => option.kind === "extra").length > 0 ? (
            <ChoiceSection title="Agregar extras">
              {product.ingredient_options.filter((option) => option.kind === "extra").map((option) => (
                <CheckChoice key={option.ingredient_id} checked={extras.includes(option.ingredient_id)} label={`Extra ${option.name}`} price={option.extra_price} onChange={() => toggle(option.ingredient_id, setExtras)} />
              ))}
            </ChoiceSection>
          ) : null}

          {product.menu_options.length > 0 ? (
            <ChoiceSection title="Opciones">
              {product.menu_options.map((option) => (
                <CheckChoice key={option.id} checked={menuOptions.includes(option.id)} label={option.name} price={option.extra_price} onChange={() => toggle(option.id, setMenuOptions)} />
              ))}
            </ChoiceSection>
          ) : null}

          <label className="mt-5 block text-sm font-bold">Notas para cocina
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={250} placeholder="Ej: salsa aparte" className="mt-2 min-h-20 w-full resize-none rounded-md border border-stone-200 p-3 text-sm font-normal outline-none focus:border-orange-400" />
          </label>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex h-12 items-center rounded-md border border-stone-200">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="h-12 w-11"><Minus className="mx-auto h-4 w-4" /></button>
              <span className="w-8 text-center text-sm font-black">{quantity}</span>
              <button type="button" onClick={() => setQuantity((value) => Math.min(20, value + 1))} className="h-12 w-11"><Plus className="mx-auto h-4 w-4" /></button>
            </div>
            <button
              type="button"
              onClick={() => onAdd({
                productId: product.id, productName: product.product_name,
                variantId: variant?.id ?? null, variantName: variant?.variant_name ?? null,
                image, unitPrice, ingredientChoices, menuOptionChoices: selectedMenuOptions, notes,
              }, quantity)}
              className="flex h-12 flex-1 items-center justify-between rounded-md bg-stone-950 px-4 text-sm font-bold text-white"
            >
              <span>Agregar</span><span>{money(unitPrice * quantity)}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function ChoiceSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="mt-5 rounded-md border border-stone-200 px-4"><legend className="px-1 text-xs font-black uppercase text-stone-500">{title}</legend>{children}</fieldset>
}

function CheckChoice({ checked, label, price, onChange }: { checked: boolean; label: string; price: number; onChange: () => void }) {
  return <label className="flex cursor-pointer items-center justify-between border-b border-stone-100 py-3 last:border-0"><span className="text-sm font-semibold">{label}</span><span className="flex items-center gap-3 text-xs font-bold text-stone-600">{price > 0 ? `+${money(price)}` : "¡GRATIS!"}<input type="checkbox" checked={checked} onChange={onChange} /></span></label>
}

function CartDialog({ cart, total, onClose, onChangeQuantity, onCheckout }: { cart: CartItem[]; total: number; onClose: () => void; onChangeQuantity: (key: string, delta: number) => void; onCheckout: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}><section className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 text-stone-950 sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-center justify-between"><h2 className="text-xl font-black">Tu pedido</h2><button type="button" onClick={onClose} className="h-9 w-9" aria-label="Cerrar"><X className="mx-auto" /></button></div>
    <div className="mt-4 divide-y divide-stone-200">{cart.map((item) => <div key={item.key} className="py-4"><div className="flex gap-3"><div className="min-w-0 flex-1"><p className="font-bold">{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</p>{[...item.ingredientChoices, ...item.menuOptionChoices].length ? <p className="mt-1 text-xs leading-5 text-stone-500">{[...item.ingredientChoices, ...item.menuOptionChoices].map((choice) => choice.name).join(", ")}</p> : null}{item.notes ? <p className="mt-1 text-xs italic text-stone-500">{item.notes}</p> : null}</div><b>{money(item.unitPrice * item.quantity)}</b></div><div className="mt-3 flex items-center gap-3"><button type="button" onClick={() => onChangeQuantity(item.key, -1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200">{item.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button><span className="text-sm font-black">{item.quantity}</span><button type="button" onClick={() => onChangeQuantity(item.key, 1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200"><Plus className="h-4 w-4" /></button></div></div>)}</div>
    <div className="mt-5 flex items-center justify-between border-t border-stone-200 pt-4 text-lg font-black"><span>Total</span><span>{money(total)}</span></div>
    <button type="button" disabled={!cart.length} onClick={onCheckout} className="mt-4 w-full rounded-md bg-orange-600 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">Continuar con el pedido</button>
  </section></div>
}

function CheckoutDialog({
  form, total, sending, error, paymentProvider, paymentMethod, fulfillmentType,
  deliveryOptions, onFulfillmentTypeChange, onPaymentMethodChange, onChange, onBack, onClose, onSubmit,
}: {
  form: DeliveryForm
  total: number
  sending: boolean
  error: string
  paymentProvider: string | null
  paymentMethod: PaymentMethod
  fulfillmentType: FulfillmentType
  deliveryOptions: { home_delivery?: boolean; pickup?: boolean }
  onFulfillmentTypeChange: (type: FulfillmentType) => void
  onPaymentMethodChange: (method: PaymentMethod) => void
  onChange: (form: DeliveryForm) => void
  onBack: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const field = (key: keyof DeliveryForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...form, [key]: event.target.value })
  const fulfillmentOptionClass = (type: FulfillmentType, enabled: boolean) => {
    if (!enabled) return "flex cursor-not-allowed flex-col items-center gap-2 rounded-md border border-stone-200 bg-stone-100 p-3 text-center text-stone-400 opacity-70"
    return fulfillmentType === type
      ? "flex cursor-pointer flex-col items-center gap-2 rounded-md border border-orange-400 bg-orange-50 p-3 text-center"
      : "flex cursor-pointer flex-col items-center gap-2 rounded-md border border-stone-200 p-3 text-center"
  }
  const changeFulfillment = (type: FulfillmentType) => {
    if (type === "home_delivery" && !deliveryOptions.home_delivery) return
    if (type === "pickup" && !deliveryOptions.pickup) return
    onFulfillmentTypeChange(type)
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}><section className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 text-stone-950 sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-center justify-between"><button type="button" onClick={onBack} className="h-9 w-9" aria-label="Volver"><ArrowLeft className="mx-auto" /></button><h2 className="text-lg font-black">Completar pedido</h2><button type="button" onClick={onClose} className="h-9 w-9" aria-label="Cerrar"><X className="mx-auto" /></button></div>
    <fieldset className="mt-5">
      <legend className="text-xs font-black uppercase text-stone-500">¿Cómo quieres recibirlo?</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className={fulfillmentOptionClass("home_delivery", Boolean(deliveryOptions.home_delivery))}>
          <input type="radio" name="fulfillment" disabled={!deliveryOptions.home_delivery} checked={fulfillmentType === "home_delivery"} onChange={() => changeFulfillment("home_delivery")} />
          <MapPin className={`h-5 w-5 ${deliveryOptions.home_delivery ? "text-orange-600" : "text-stone-400"}`} />
          <b className="text-sm">A domicilio</b>
          {!deliveryOptions.home_delivery ? <span className="text-[11px] font-bold uppercase">No disponible</span> : null}
        </label>
        <label className={fulfillmentOptionClass("pickup", Boolean(deliveryOptions.pickup))}>
          <input type="radio" name="fulfillment" disabled={!deliveryOptions.pickup} checked={fulfillmentType === "pickup"} onChange={() => changeFulfillment("pickup")} />
          <Store className={`h-5 w-5 ${deliveryOptions.pickup ? "text-orange-600" : "text-stone-400"}`} />
          <b className="text-sm">Retiro en tienda</b>
          {!deliveryOptions.pickup ? <span className="text-[11px] font-bold uppercase">No disponible</span> : null}
        </label>
      </div>
    </fieldset>
    <div className="mt-5 space-y-4">
      <InputField icon={<User />} label="Nombre" value={form.name} onChange={field("name")} maxLength={80} />
      <InputField icon={<Phone />} label="Teléfono" value={form.phone} onChange={field("phone")} maxLength={24} type="tel" />
      {fulfillmentType === "home_delivery" ? (
        <>
          <InputField icon={<MapPin />} label="Dirección completa" value={form.address} onChange={field("address")} maxLength={180} />
          <label className="block text-xs font-bold text-stone-600">Referencia (opcional)<textarea value={form.reference} onChange={field("reference")} maxLength={250} placeholder="Casa azul, timbre 2..." className="mt-1 min-h-20 w-full resize-none rounded-md border border-stone-200 p-3 text-sm font-normal text-stone-950 outline-none focus:border-orange-400" /></label>
        </>
      ) : (
        <label className="block text-xs font-bold text-stone-600">Comentario para el retiro (opcional)<textarea value={form.reference} onChange={field("reference")} maxLength={250} placeholder="Ej: retiraré a nombre de..." className="mt-1 min-h-20 w-full resize-none rounded-md border border-stone-200 p-3 text-sm font-normal text-stone-950 outline-none focus:border-orange-400" /></label>
      )}
    </div>
    <fieldset className="mt-5">
      <legend className="text-xs font-black uppercase text-stone-500">Forma de pago</legend>
      <div className="mt-2 grid gap-2">
        {paymentProvider ? (
          <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${paymentMethod === "online" ? "border-orange-400 bg-orange-50" : "border-stone-200"}`}>
            <input type="radio" name="delivery-payment" checked={paymentMethod === "online"} onChange={() => onPaymentMethodChange("online")} />
            <CreditCard className="h-5 w-5 text-orange-600" />
            <span className="min-w-0"><b className="block text-sm">Pagar online</b><span className="block text-xs text-stone-500">Con {PAYMENT_PROVIDER_LABEL[paymentProvider] ?? paymentProvider}</span></span>
          </label>
        ) : null}
        <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${paymentMethod === "pay_at_store" ? "border-orange-400 bg-orange-50" : "border-stone-200"}`}>
          <input type="radio" name="delivery-payment" checked={paymentMethod === "pay_at_store"} onChange={() => onPaymentMethodChange("pay_at_store")} />
          <Store className="h-5 w-5 text-orange-600" />
          <span>
            <b className="block text-sm">{fulfillmentType === "pickup" ? "Pagar al retirar" : "Pagar al recibir"}</b>
            <span className="block text-xs text-stone-500">El pedido se confirma ahora y pagas después</span>
          </span>
        </label>
      </div>
    </fieldset>
    {paymentMethod === "online" && paymentProvider === "flow" ? <div className="mt-4"><InputField icon={<User />} label="Email para el comprobante" value={form.email} onChange={field("email")} maxLength={120} type="email" /></div> : null}
    {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
    <div className="mt-5 flex items-center justify-between border-t border-stone-200 pt-4 text-lg font-black"><span>Total</span><span>{money(total)}</span></div>
    <button type="button" disabled={sending} onClick={onSubmit} className="mt-4 w-full rounded-md bg-orange-600 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60">{sending ? (paymentMethod === "online" ? "Conectando con la pasarela..." : "Enviando pedido...") : paymentMethod === "online" ? `Pagar online · ${money(total)}` : "Confirmar pedido"}</button>
  </section></div>
}

function InputField({ icon, label, value, onChange, maxLength, type = "text" }: { icon: React.ReactNode; label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; maxLength: number; type?: string }) {
  return <label className="block text-xs font-bold text-stone-600">{label}<span className="mt-1 flex items-center gap-2 rounded-md border border-stone-200 px-3 focus-within:border-orange-400"><span className="[&>svg]:h-4 [&>svg]:w-4 text-stone-400">{icon}</span><input type={type} value={value} onChange={onChange} maxLength={maxLength} className="h-11 min-w-0 flex-1 text-sm font-normal text-stone-950 outline-none" /></span></label>
}
