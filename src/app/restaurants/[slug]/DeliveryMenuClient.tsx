"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Trash2,
  User,
  X,
} from "lucide-react"
import { createSupabaseAnonClient } from "@/lib/supabase/anon"
import type { MenuTemplate } from "@/types/restaurant"

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

type DeliveryForm = { name: string; phone: string; address: string; reference: string }

const EMPTY_FORM: DeliveryForm = { name: "", phone: "", address: "", reference: "" }

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

export function DeliveryMenuClient({ data }: { data: DeliveryMenuData }) {
  const { restaurant, categories, products } = data
  const storageKey = `mesa-delivery-cart:${restaurant.delivery_slug}`
  const [cart, setCart] = useState<CartItem[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [form, setForm] = useState<DeliveryForm>(EMPTY_FORM)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [completed, setCompleted] = useState<{ id: number; total: number } | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const requestIdRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratacion unica del carrito persistido
      if (saved) setCart(JSON.parse(saved) as CartItem[])
    } catch {
      localStorage.removeItem(storageKey)
    }
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(storageKey, JSON.stringify(cart))
  }, [cart, hydrated, storageKey])

  const groups = categories
    .map((category) => ({
      category,
      products: products.filter((product) => product.category_id === category.id),
    }))
    .filter((group) => group.products.length > 0)

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
    if (form.name.trim().length < 2 || form.phone.trim().length < 7 || form.address.trim().length < 5) {
      setError("Completa tu nombre, teléfono y dirección para continuar.")
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
      })

      if (rpcError) throw rpcError
      const order = result as unknown as { id: number; total: number }
      setCompleted({ id: order.id, total: order.total })
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
    <main className="min-h-screen bg-[#f7f5f2] pb-28 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5 sm:px-6">
          {restaurant.restaurant_logo ? (
            <Image
              src={restaurant.restaurant_logo}
              alt=""
              width={64}
              height={64}
              className="h-14 w-14 rounded-lg border border-stone-200 object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-stone-950 text-xl font-black text-white">
              {restaurant.restaurant_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-orange-600">Pedidos a domicilio</p>
            <h1 className="truncate text-2xl font-black">{restaurant.restaurant_name}</h1>
            {restaurant.restaurant_city ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
                <MapPin className="h-3.5 w-3.5" /> {restaurant.restaurant_city}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3 sm:px-6">
          {groups.map(({ category }) => (
            <a
              key={category.id}
              href={`#category-${category.id}`}
              className="shrink-0 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-bold text-stone-700 hover:border-orange-300 hover:text-orange-700"
            >
              {category.category_name}
            </a>
          ))}
        </nav>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
        {groups.length === 0 ? (
          <p className="py-20 text-center text-sm font-semibold text-stone-500">No hay productos disponibles.</p>
        ) : (
          <div className="space-y-10">
            {groups.map(({ category, products: categoryProducts }) => (
              <section key={category.id} id={`category-${category.id}`} className="scroll-mt-20">
                <h2 className="mb-4 text-xl font-black">{category.category_name}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {categoryProducts.map((product) => {
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
                        className="group flex min-h-28 items-center gap-4 rounded-lg border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-300 hover:shadow-md disabled:opacity-55"
                      >
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-stone-100">
                          {product.product_image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.product_image} alt="" className="h-full w-full object-contain p-1" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-stone-300"><ShoppingBag /></div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-extrabold leading-tight">{product.product_name}</h3>
                          {product.product_description ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{product.product_description}</p>
                          ) : null}
                          <p className="mt-2 text-sm font-black text-orange-700">
                            {product.variants.length ? "Desde " : ""}{money(fromPrice)}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-stone-300 group-hover:text-orange-500" />
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
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
          onChange={setForm}
          onBack={() => { setCheckoutOpen(false); setCartOpen(true); setError("") }}
          onClose={() => setCheckoutOpen(false)}
          onSubmit={submitOrder}
        />
      ) : null}

      {completed ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-sm rounded-lg bg-white p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-2xl font-black">Pedido recibido</h2>
            <p className="mt-2 text-sm text-stone-600">Tu pedido #{completed.id} ya fue enviado al restaurante.</p>
            <p className="mt-4 text-xl font-black">{money(completed.total)}</p>
            <button type="button" onClick={() => setCompleted(null)} className="mt-6 w-full rounded-lg bg-stone-950 px-4 py-3 text-sm font-bold text-white">
              Volver al menú
            </button>
          </section>
        </div>
      ) : null}
    </main>
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
      <section className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
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
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}><section className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-center justify-between"><h2 className="text-xl font-black">Tu pedido</h2><button type="button" onClick={onClose} className="h-9 w-9" aria-label="Cerrar"><X className="mx-auto" /></button></div>
    <div className="mt-4 divide-y divide-stone-200">{cart.map((item) => <div key={item.key} className="py-4"><div className="flex gap-3"><div className="min-w-0 flex-1"><p className="font-bold">{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</p>{[...item.ingredientChoices, ...item.menuOptionChoices].length ? <p className="mt-1 text-xs leading-5 text-stone-500">{[...item.ingredientChoices, ...item.menuOptionChoices].map((choice) => choice.name).join(", ")}</p> : null}{item.notes ? <p className="mt-1 text-xs italic text-stone-500">{item.notes}</p> : null}</div><b>{money(item.unitPrice * item.quantity)}</b></div><div className="mt-3 flex items-center gap-3"><button type="button" onClick={() => onChangeQuantity(item.key, -1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200">{item.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button><span className="text-sm font-black">{item.quantity}</span><button type="button" onClick={() => onChangeQuantity(item.key, 1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200"><Plus className="h-4 w-4" /></button></div></div>)}</div>
    <div className="mt-5 flex items-center justify-between border-t border-stone-200 pt-4 text-lg font-black"><span>Total</span><span>{money(total)}</span></div>
    <button type="button" disabled={!cart.length} onClick={onCheckout} className="mt-4 w-full rounded-md bg-orange-600 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">Ingresar datos de entrega</button>
  </section></div>
}

function CheckoutDialog({ form, total, sending, error, onChange, onBack, onClose, onSubmit }: { form: DeliveryForm; total: number; sending: boolean; error: string; onChange: (form: DeliveryForm) => void; onBack: () => void; onClose: () => void; onSubmit: () => void }) {
  const field = (key: keyof DeliveryForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...form, [key]: event.target.value })
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}><section className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-center justify-between"><button type="button" onClick={onBack} className="h-9 w-9" aria-label="Volver"><ArrowLeft className="mx-auto" /></button><h2 className="text-lg font-black">Datos de entrega</h2><button type="button" onClick={onClose} className="h-9 w-9" aria-label="Cerrar"><X className="mx-auto" /></button></div>
    <div className="mt-5 space-y-4"><InputField icon={<User />} label="Nombre" value={form.name} onChange={field("name")} maxLength={80} /><InputField icon={<Phone />} label="Teléfono" value={form.phone} onChange={field("phone")} maxLength={24} type="tel" /><InputField icon={<MapPin />} label="Dirección completa" value={form.address} onChange={field("address")} maxLength={180} /><label className="block text-xs font-bold text-stone-600">Referencia (opcional)<textarea value={form.reference} onChange={field("reference")} maxLength={250} placeholder="Casa azul, timbre 2..." className="mt-1 min-h-20 w-full resize-none rounded-md border border-stone-200 p-3 text-sm font-normal outline-none focus:border-orange-400" /></label></div>
    {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
    <div className="mt-5 flex items-center justify-between border-t border-stone-200 pt-4 text-lg font-black"><span>Total</span><span>{money(total)}</span></div>
    <button type="button" disabled={sending} onClick={onSubmit} className="mt-4 w-full rounded-md bg-orange-600 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60">{sending ? "Enviando pedido..." : "Confirmar pedido"}</button>
  </section></div>
}

function InputField({ icon, label, value, onChange, maxLength, type = "text" }: { icon: React.ReactNode; label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; maxLength: number; type?: string }) {
  return <label className="block text-xs font-bold text-stone-600">{label}<span className="mt-1 flex items-center gap-2 rounded-md border border-stone-200 px-3 focus-within:border-orange-400"><span className="[&>svg]:h-4 [&>svg]:w-4 text-stone-400">{icon}</span><input type={type} value={value} onChange={onChange} maxLength={maxLength} className="h-11 min-w-0 flex-1 text-sm font-normal outline-none" /></span></label>
}
