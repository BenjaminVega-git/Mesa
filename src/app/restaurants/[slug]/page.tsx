import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { createSupabaseAnonClient } from "@/lib/supabase/anon"
import { getTemplateDesign } from "@/lib/menu/templates"
import { encodeId } from "@/lib/hashids"
import type { MenuTemplate } from "@/types/restaurant"

type Params = Promise<{ slug: string }>

type Variant = {
  id: number
  variant_name: string
  variant_description: string | null
  variant_price: number
  variant_image: string | null
}

type Product = {
  id: number
  product_name: string
  product_description: string | null
  product_price: number
  product_image: string | null
  category_id: number
  status_id: number
  category_name: string | null
  variants: Variant[]
}

type Category = { id: number; category_name: string }

type RestaurantInfo = {
  id: number
  restaurant_name: string
  restaurant_logo: string | null
  restaurant_city: string | null
  menu_template: MenuTemplate
  delivery_slug: string
}

type RpcResult = {
  restaurant: RestaurantInfo
  categories: Category[]
  products: Product[]
}

async function fetchBySlug(slug: string): Promise<RpcResult | null> {
  const supabase = createSupabaseAnonClient()
  const { data, error } = await supabase.rpc("get_restaurant_by_slug", { p_slug: slug })
  if (error || !data) return null
  return data as unknown as RpcResult
}

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

// Cuando se reactive delivery, cambiar a true.
const DELIVERY_ENABLED = false

export default async function DeliveryRestaurantPage({ params }: { params: Params }) {
  if (!DELIVERY_ENABLED) notFound()

  const { slug } = await params

  // Si llega un valor numérico es probable que el usuario haya entrado por el viejo
  // /restaurant/[id] o un link antiguo — no resolvemos por id desde el slug route.
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) notFound()

  const data = await fetchBySlug(slug)
  if (!data) notFound()

  const { restaurant, categories, products } = data
  const design = getTemplateDesign(restaurant.menu_template)

  const overlayBg =
    restaurant.menu_template === "aurora" ? "bg-[#090d16]"
    : restaurant.menu_template === "cyber-ruby" ? "bg-[#090514]"
    : restaurant.menu_template === "eclipse" ? "bg-[#050507]"
    : restaurant.menu_template === "forest-moss" ? "bg-[#0b1411]"
    : restaurant.menu_template === "nordic-minimal" ? "bg-[#eef3f7]"
    : "bg-stone-950"

  const overlayGradient =
    restaurant.menu_template === "aurora"
      ? "bg-[radial-gradient(circle_at_15%_20%,rgba(91,33,182,0.45)_0%,transparent_50%),radial-gradient(circle_at_85%_80%,rgba(6,182,212,0.3)_0%,transparent_50%)]"
      : restaurant.menu_template === "cyber-ruby"
      ? "bg-[radial-gradient(circle_at_85%_20%,rgba(217,70,239,0.18)_0%,transparent_50%),radial-gradient(circle_at_15%_80%,rgba(29,78,216,0.15)_0%,transparent_50%)]"
      : restaurant.menu_template === "eclipse"
      ? "bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.06)_0%,transparent_50%)]"
      : restaurant.menu_template === "forest-moss"
      ? "bg-[radial-gradient(circle_at_85%_20%,rgba(245,158,11,0.22)_0%,transparent_45%),radial-gradient(circle_at_20%_80%,rgba(22,163,74,0.32)_0%,transparent_60%)]"
      : restaurant.menu_template === "nordic-minimal"
      ? "bg-[linear-gradient(120deg,rgba(235,243,250,1)_0%,rgba(225,235,245,0.6)_40%,rgba(240,244,248,1)_100%)]"
      : "bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.22),_transparent_34%),linear-gradient(180deg,_#1c1917_0%,_#0c0a09_58%,_#020617_100%)]"

  const productsByCategory = categories
    .map((cat) => ({
      category: cat,
      items: products.filter((p) => p.category_id === cat.id && p.status_id === 1),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <main className={`relative min-h-screen ${overlayBg}`}>
      <div className={`pointer-events-none absolute inset-0 ${overlayGradient}`} />

      <div className="relative mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className={`text-xs font-semibold ${design.mesaText} hover:underline`}
          >
            ← Volver a MESA
          </Link>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${design.abiertoBadge}`}>
            Delivery
          </span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr] lg:items-start lg:gap-12">
          <aside className="lg:sticky lg:top-8">
            <header className="flex items-start gap-4 lg:flex-col lg:items-stretch">
              {restaurant.restaurant_logo ? (
                <Image
                  src={restaurant.restaurant_logo}
                  alt={restaurant.restaurant_name}
                  width={120}
                  height={120}
                  className="h-18 w-18 shrink-0 rounded-2xl object-cover ring-1 ring-white/10 lg:h-28 lg:w-28"
                  unoptimized
                />
              ) : (
                <div className={`flex h-18 w-18 shrink-0 items-center justify-center rounded-2xl lg:h-28 lg:w-28 ${design.card}`}>
                  <span className={`text-2xl font-black lg:text-4xl ${design.titleClass}`}>
                    {restaurant.restaurant_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <h1 className={`text-3xl font-black tracking-tight lg:text-4xl ${design.titleClass}`}>
                  {restaurant.restaurant_name}
                </h1>
                {restaurant.restaurant_city && (
                  <p className={`mt-1 text-sm ${design.mesaText}`}>
                    📍 {restaurant.restaurant_city}
                  </p>
                )}
              </div>
            </header>

            <div className={`mt-6 rounded-2xl border border-white/10 p-4 ${design.card}`}>
              <p className={`text-sm font-semibold ${design.cardName}`}>
                ¿Querés pedir? Hacé tu pedido por delivery o escaneá el QR de tu mesa.
              </p>
              <p className={`mt-1 text-xs ${design.cardDesc}`}>
                Próximamente vas a poder armar tu pedido directo desde acá.
              </p>
            </div>
          </aside>

          <div className="min-w-0">
            {productsByCategory.length === 0 ? (
              <p className={`text-center text-sm ${design.cardDesc}`}>
                Este restaurante todavía no publicó su menú.
              </p>
            ) : (
              <div className="space-y-10">
                {productsByCategory.map(({ category, items }) => (
                  <section key={category.id}>
                    <h2 className={`mb-3 text-lg font-black uppercase tracking-wider ${design.titleClass}`}>
                      {category.category_name}
                    </h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      {items.map((item) => (
                        <Link
                          key={item.id}
                          href={`/restaurants/${restaurant.delivery_slug}/${encodeId(item.id)}`}
                          className={`flex gap-3 rounded-2xl p-3 transition hover:-translate-y-0.5 hover:shadow-lg ${design.card}`}
                        >
                      <div className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl ${design.cardImageBg}`}>
                        {item.product_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product_image} alt={item.product_name} className="h-full w-full object-contain p-1.5" />
                        ) : (
                          <span className={`text-2xl ${design.cardCat}`}>+</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-base font-black leading-tight ${design.cardName}`}>
                          {item.product_name}
                        </p>
                        {item.product_description && (
                          <p className={`mt-1 line-clamp-2 text-xs ${design.cardDesc}`}>
                            {item.product_description}
                          </p>
                        )}
                        {item.variants && item.variants.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.variants.map((v) => (
                              <span
                                key={v.id}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${design.pillInactive}`}
                              >
                                {v.variant_name} · {formatPrice(v.variant_price)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className={`mt-2 text-sm font-black ${design.cardPrice}`}>
                            {formatPrice(item.product_price)}
                          </p>
                        )}
                      </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </main>
  )
}
