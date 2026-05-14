"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { decodeId } from "@/lib/hashids"
import { useProductDetail } from "@/hooks/useProductDetail"
import { useProductVariants } from "@/hooks/useProductVariants"
import { FloatingCartButton } from "@/components/customer/FloatingCartButton"

function formatPrice(price: number) {
  return `$${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string; productId: string }>
}) {
  const { productId } = use(params)
  const router = useRouter()
  const [activeOptionIndex, setActiveOptionIndex] = useState(0)
  const realProductId = decodeId(productId)
  const { product, loading, error } = useProductDetail(realProductId)
  const {
    variants,
    loading: loadingVariants,
    error: variantsError
  } = useProductVariants(realProductId)

  if (!realProductId) return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 px-4 text-white">
      <div className="rounded-[2rem] bg-red-500/10 px-6 py-5 text-center shadow-2xl shadow-black/30 ring-1 ring-red-300/20 backdrop-blur">
        <p className="text-sm font-semibold text-red-100">Producto no encontrado</p>
      </div>
    </main>
  )

  if (loading) return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 text-white">
      <div className="rounded-[2rem] bg-white/10 px-6 py-5 text-center shadow-2xl shadow-black/30 ring-1 ring-white/10 backdrop-blur">
        <p className="text-sm font-semibold text-orange-100">Cargando producto...</p>
      </div>
    </main>
  )

  if (error || !product) return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 px-4 text-white">
      <div className="rounded-[2rem] bg-red-500/10 px-6 py-5 text-center shadow-2xl shadow-black/30 ring-1 ring-red-300/20 backdrop-blur">
        <p className="text-sm font-semibold text-red-100">{error || "Producto no encontrado"}</p>
      </div>
    </main>
  )

  const productOptions = variants.length > 0
    ? variants.map((variant) => ({
      id: variant.id,
      name: variant.variant_name,
      price: variant.variant_price,
      image: variant.variant_image,
    }))
    : [{
      id: product.id,
      name: product.product_name,
      price: product.product_price,
      image: product.product_image,
    }]
  const activeOption = productOptions[Math.min(activeOptionIndex, productOptions.length - 1)]
  const activeTitle = variants.length > 0
    ? `${product.product_name} · ${activeOption.name}`
    : product.product_name

  function handleOptionsScroll(event: React.UIEvent<HTMLDivElement>) {
    const scrollContainer = event.currentTarget
    const firstSlide = scrollContainer.querySelector<HTMLElement>("[data-option-slide]")

    if (!firstSlide) return

    const slideWidth = firstSlide.offsetWidth
    const nextIndex = Math.max(
      0,
      Math.min(
        productOptions.length - 1,
        Math.round(scrollContainer.scrollLeft / slideWidth)
      )
    )

    if (nextIndex !== activeOptionIndex) {
      setActiveOptionIndex(nextIndex)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-stone-950 pb-28 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.22),_transparent_34%),radial-gradient(circle_at_85%_12%,_rgba(120,53,15,0.34),_transparent_28%),linear-gradient(180deg,_#1c1917_0%,_#0c0a09_58%,_#020617_100%)]" />

      <section className="relative mx-auto max-w-md px-4 pb-6 pt-5 md:max-w-2xl md:px-6 lg:max-w-3xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center rounded-full bg-white/10 px-5 py-3 text-sm font-black text-orange-100 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/[0.14] hover:text-orange-200"
        >
          Volver al menú
        </button>

        <div
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          onScroll={handleOptionsScroll}
        >
          {productOptions.map((option) => (
            <div
              key={option.id}
              data-option-slide
              className="relative flex aspect-square w-full shrink-0 snap-center items-center justify-center overflow-hidden rounded-[2.25rem] md:aspect-[4/3]"
            >
              <div className="absolute inset-x-10 bottom-6 h-8 rounded-full bg-black/30 blur-xl" />
              {option.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={option.image}
                  alt={option.name}
                  className="relative z-10 h-full w-full object-contain p-8 drop-shadow-2xl"
                  loading="lazy"
                />
              ) : (
                <div className="relative z-10 flex flex-col items-center text-center text-orange-100/80">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-3xl ring-1 ring-white/10">
                    +
                  </div>
                  <p className="mt-3 text-xs font-bold">Sin imagen</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 px-1">
          <p className="text-xs font-bold text-orange-200/80">
            {product.categories?.category_name}
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
            {activeTitle}
          </h1>

          {product.product_description && (
            <p className="mt-4 text-sm leading-6 text-stone-300">
              {product.product_description}
            </p>
          )}

          <div className="mt-7 flex justify-center">
            <div className="w-full rounded-[2rem] bg-white/10 px-5 py-5 text-center shadow-xl shadow-black/20 ring-1 ring-white/10 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">
                Precio
              </p>
              <p className="mt-2 text-4xl font-black tracking-tight text-orange-200 tabular-nums">
                {formatPrice(activeOption.price)}
              </p>
              <button
                type="button"
                className="mt-5 flex w-full items-center justify-center rounded-[1.35rem] bg-orange-500 px-5 py-4 text-sm font-black text-stone-950 shadow-2xl shadow-orange-500/25 ring-1 ring-orange-200/50 transition hover:bg-orange-400"
              >
                Añadir al carrito
              </button>
            </div>
          </div>

          {productOptions.length > 1 && (
            <div className="mt-5 flex justify-center gap-2">
              {productOptions.map((option, index) => (
                <span
                  key={option.id}
                  className={`h-2 rounded-full transition-all ${
                    index === activeOptionIndex
                      ? "w-7 bg-orange-300"
                      : "w-2 bg-white/25"
                  }`}
                />
              ))}
            </div>
          )}

          {loadingVariants && variants.length === 0 && (
            <p className="mt-4 text-center text-sm font-semibold text-stone-300">
              Cargando opciones...
            </p>
          )}

          {variantsError && (
            <p className="mt-4 text-center text-sm font-semibold text-red-300">
              {variantsError}
            </p>
          )}
        </div>
      </section>

      <FloatingCartButton />
    </main>
  )
}
