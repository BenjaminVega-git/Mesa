"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { getTemplateDesign } from "@/lib/menu/templates"
import type { PublicProductRow, PublicRestaurantInfo } from "./page"

function formatPrice(price: number) {
  return `$${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

type Props = {
  restaurant: PublicRestaurantInfo
  product: PublicProductRow
}

export function PublicProductDetailClient({ restaurant, product }: Props) {
  const [activeOptionIndex, setActiveOptionIndex] = useState(0)
  const [isSliding, setIsSliding] = useState(false)

  const sliderRef = useRef<HTMLDivElement | null>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isProgrammaticScrollRef = useRef(false)

  const design = getTemplateDesign(restaurant.menu_template)

  const productOptions =
    product.variants.length > 0
      ? product.variants.map((v) => ({
          id: v.id,
          name: v.variant_name,
          description: v.variant_description,
          price: v.variant_price,
          image: v.variant_image,
        }))
      : [
          {
            id: product.id,
            name: product.product_name,
            description: null,
            price: product.product_price,
            image: product.product_image,
          },
        ]

  const activeOption = productOptions[Math.min(activeOptionIndex, productOptions.length - 1)]
  const activeTitle =
    product.variants.length > 0
      ? `${product.product_name} · ${activeOption.name}`
      : product.product_name
  const hasMultipleOptions = productOptions.length > 1

  function scrollToOption(index: number) {
    const slider = sliderRef.current
    if (!slider) return
    const safeIndex = Math.max(0, Math.min(productOptions.length - 1, index))
    const slide = slider.querySelector<HTMLElement>("[data-option-slide]")
    if (!slide) return

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

    isProgrammaticScrollRef.current = true
    setIsSliding(true)
    slider.scrollTo({ left: slide.offsetWidth * safeIndex, behavior: "smooth" })

    scrollTimeoutRef.current = setTimeout(() => {
      setActiveOptionIndex(safeIndex)
      isProgrammaticScrollRef.current = false
      setIsSliding(false)
    }, 420)
  }

  function handleOptionsScroll() {
    if (isProgrammaticScrollRef.current) return
    const slider = sliderRef.current
    if (!slider) return
    const slide = slider.querySelector<HTMLElement>("[data-option-slide]")
    if (!slide) return
    const index = Math.round(slider.scrollLeft / slide.offsetWidth)
    if (index !== activeOptionIndex) setActiveOptionIndex(index)
  }

  return (
    <main className={`min-h-screen overflow-hidden pb-28 ${design.mainClass}`}>
      <div className={`pointer-events-none fixed inset-0 ${design.overlayClass}`} />

      <section className="relative mx-auto max-w-md px-4 pb-6 pt-5 md:max-w-2xl md:px-6 lg:max-w-3xl">
        <Link
          href={`/restaurants/${restaurant.delivery_slug}`}
          className="mb-6 inline-flex items-center rounded-full bg-white/10 px-5 py-3 text-sm font-black text-orange-100 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/[0.14] hover:text-orange-200"
        >
          ← Volver al menú
        </Link>

        <div className="relative">
          {hasMultipleOptions && (
            <>
              <button
                type="button"
                onClick={() => scrollToOption(activeOptionIndex - 1)}
                disabled={activeOptionIndex === 0 || isSliding}
                className="absolute left-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/5 border border-white/10 text-stone-300 shadow-md backdrop-blur-sm transition-all duration-300 hover:bg-white/15 hover:text-white active:scale-90 disabled:pointer-events-none disabled:opacity-0"
                aria-label="Ver opción anterior"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => scrollToOption(activeOptionIndex + 1)}
                disabled={activeOptionIndex === productOptions.length - 1 || isSliding}
                className="absolute right-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/5 border border-white/10 text-stone-300 shadow-md backdrop-blur-sm transition-all duration-300 hover:bg-white/15 hover:text-white active:scale-90 disabled:pointer-events-none disabled:opacity-0"
                aria-label="Ver siguiente opción"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          <div
            ref={sliderRef}
            className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            onScroll={handleOptionsScroll}
          >
            {productOptions.map((option) => (
              <div
                key={option.id}
                data-option-slide
                className="relative flex aspect-[1.6] max-h-[250px] w-full shrink-0 snap-center items-center justify-center overflow-hidden rounded-[2.25rem] md:aspect-[4/3]"
              >
                <div className="absolute inset-x-10 bottom-2 h-4 rounded-full bg-black/40 blur-lg" />

                {option.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={option.image}
                    alt={option.name}
                    className="relative z-10 h-full max-h-[230px] w-full object-contain p-2 drop-shadow-2xl transition-transform duration-300 hover:scale-[1.03]"
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
        </div>

        {hasMultipleOptions && (
          <div className="mt-3 flex flex-col items-center gap-3">
            <p className="text-xs font-bold text-white/40">Desliza para ver más opciones</p>

            <div className="flex justify-center gap-2">
              {productOptions.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => scrollToOption(index)}
                  disabled={isSliding}
                  className={`h-2 rounded-full transition-all ${
                    index === activeOptionIndex
                      ? "w-8 bg-orange-300"
                      : "w-2 bg-white/25 hover:bg-white/40"
                  } disabled:pointer-events-none disabled:opacity-60`}
                  aria-label={`Ver opción ${index + 1}`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 px-1">
          {product.category_name && (
            <p className="text-xs font-bold text-orange-200/80">{product.category_name}</p>
          )}

          <h1 className="mt-2 text-4xl font-black tracking-tight text-white">{activeTitle}</h1>

          {product.product_description && (
            <p className="mt-4 text-sm leading-6 text-stone-300">{product.product_description}</p>
          )}

          {activeOption.description && (
            <p className="mt-3 text-sm leading-6 text-stone-400">{activeOption.description}</p>
          )}

          <div className="mt-7 flex justify-center">
            <div className="w-full rounded-[2.25rem] bg-white/5 p-6 text-center shadow-2xl shadow-black/40 border border-white/10 backdrop-blur-md ring-1 ring-white/5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-orange-300 border border-orange-500/20 shadow-sm">
                Precio del Producto
              </div>

              <p className="mt-3.5 text-4xl font-black tracking-tight text-orange-200 drop-shadow-[0_0_15px_rgba(251,146,60,0.3)] tabular-nums leading-none">
                {formatPrice(activeOption.price)}
              </p>

              <button
                type="button"
                disabled
                className="mt-6 flex w-full cursor-not-allowed items-center justify-center rounded-[1.35rem] bg-stone-700 px-5 py-4 text-sm font-black text-stone-400 ring-1 ring-white/10"
              >
                Próximamente: pedir por delivery
              </button>
              <p className="mt-3 text-[11px] leading-4 text-stone-400">
                O escaneá el QR de tu mesa para pedir en el local.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
