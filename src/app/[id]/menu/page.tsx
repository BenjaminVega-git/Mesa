"use client"

import { use, useState } from "react"
import Link from "next/link"
import { FloatingCartButton } from "@/components/customer/FloatingCartButton"
import { useMenuData } from "@/hooks/useMenuData"
import { encodeId } from "@/lib/hashids"

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

function ProductImage({
  src,
  alt,
  className,
  imageClassName,
}: {
  src: string | null
  alt: string
  className: string
  imageClassName: string
}) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(251,146,60,0.22),_transparent_58%)]" />
      <div className="absolute inset-x-8 bottom-4 h-8 rounded-full bg-black/30 blur-xl" />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={`relative z-10 h-full w-full object-contain ${imageClassName}`}
          loading="lazy"
        />
      ) : (
        <div className="relative z-10 flex flex-col items-center text-center text-orange-100/80">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10 text-2xl ring-1 ring-white/10">
            +
          </div>
          <p className="mt-3 text-xs font-bold">Sin imagen</p>
        </div>
      )}
    </div>
  )
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { restaurant, categories, products, tableNumber, loading, error } = useMenuData(id)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const filteredProducts = selectedCategory
  ? products.filter((p) => p.category_id === selectedCategory && p.status_id !== 3)
  : products.filter((p) => p.status_id !== 3)

  if (loading) return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 text-white">
      <div className="rounded-[2rem] bg-white/10 px-6 py-5 text-center shadow-2xl shadow-black/30 ring-1 ring-white/10 backdrop-blur">
        <p className="text-sm font-semibold text-orange-100">Cargando menu...</p>
      </div>
    </main>
  )

  if (error) return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 px-4 text-white">
      <div className="rounded-[2rem] bg-red-500/10 px-6 py-5 text-center shadow-2xl shadow-black/30 ring-1 ring-red-300/20 backdrop-blur">
        <p className="text-sm font-semibold text-red-100">{error}</p>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen overflow-hidden bg-stone-950 pb-28 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.22),_transparent_34%),radial-gradient(circle_at_85%_12%,_rgba(120,53,15,0.34),_transparent_28%),linear-gradient(180deg,_#1c1917_0%,_#0c0a09_58%,_#020617_100%)]" />

      <section className="relative mx-auto min-h-screen max-w-md px-4 pb-6 pt-5 md:max-w-2xl md:px-6 lg:max-w-3xl">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-200/80">Mesa {tableNumber}</p>
            <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-white">
              {restaurant?.restaurant_name}
            </h1>
          </div>
          <span className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-orange-100 ring-1 ring-white/10 backdrop-blur">
            Abierto
          </span>
        </header>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 rounded-full px-5 py-3 text-sm font-black shadow-lg transition ${
              selectedCategory === null
                ? "bg-orange-500 text-stone-950 shadow-orange-500/25"
                : "bg-white/10 text-stone-200 ring-1 ring-white/10 backdrop-blur"
            }`}
          >
            Todo
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-full px-5 py-3 text-sm font-black shadow-lg transition ${
                selectedCategory === cat.id
                  ? "bg-orange-500 text-stone-950 shadow-orange-500/25"
                  : "bg-white/10 text-stone-200 ring-1 ring-white/10 backdrop-blur"
              }`}
            >
              {cat.category_name}
            </button>
          ))}
        </div>

        {/* futuras secciones como ofertas, menu del dia, etc */}

        {filteredProducts.length > 0 ? (
          <section className="mt-7">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-orange-200/80">Menú principal</p>
                <h2 className="text-2xl font-black tracking-tight text-white">Menú completo</h2>
              </div>
              <p className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-stone-300 ring-1 ring-white/10">
                {filteredProducts.length} productos
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {filteredProducts.map((item) => (
                <Link
                  key={item.id}
                  href={`/${id}/menu/${encodeId(item.id)}`}
                  className="flex cursor-pointer gap-4 rounded-[1.75rem] bg-white/10 p-3 shadow-xl shadow-black/20 ring-1 ring-white/10 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.13]"
                >
                  <ProductImage
                    src={item.product_image}
                    alt={item.product_name}
                    className="aspect-square h-28 shrink-0 rounded-[1.4rem] bg-gradient-to-br from-stone-900 via-stone-800 to-orange-950"
                    imageClassName="p-3 drop-shadow-xl"
                  />
                  <div className="min-w-0 flex-1 py-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-orange-200/80">
                          {item.categories?.category_name}
                        </p>
                        <h3 className="mt-1 line-clamp-2 font-black leading-tight text-white">
                          {item.product_name}
                        </h3>
                      </div>
                      <p className="shrink-0 text-sm font-black text-orange-200">
                        {formatPrice(item.product_price)}
                      </p>
                    </div>
                    {item.product_description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-300">
                        {item.product_description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <div className="mt-8 rounded-[2rem] bg-white/10 px-6 py-12 text-center shadow-2xl shadow-black/30 ring-1 ring-white/10 backdrop-blur">
            <h2 className="mt-5 text-2xl font-black tracking-tight">Aún no hay productos disponibles</h2>
          </div>
        )}
      </section>

      <FloatingCartButton />
    </main>
  )
}
