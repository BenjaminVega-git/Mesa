"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { decodeId } from "@/lib/hashids"
import { useProductDetail } from "@/hooks/useProductDetail"
import { FloatingCartButton } from "@/components/customer/FloatingCartButton"

function formatPrice(price: number) {
  return `$${price.toLocaleString("es-CL")}`
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string; productId: string }>
}) {
  const { productId } = use(params)
  const router = useRouter()
  const realProductId = decodeId(productId)
  const { product, loading, error } = useProductDetail(realProductId)

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

  return (
    <main className="min-h-screen overflow-hidden bg-stone-950 pb-28 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.22),_transparent_34%),radial-gradient(circle_at_85%_12%,_rgba(120,53,15,0.34),_transparent_28%),linear-gradient(180deg,_#1c1917_0%,_#0c0a09_58%,_#020617_100%)]" />

      <section className="relative mx-auto max-w-md px-4 pb-6 pt-5 md:max-w-2xl md:px-6 lg:max-w-3xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 text-sm font-semibold text-orange-400 transition hover:text-orange-300"
        >
          Volver al menu
        </button>

        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-stone-900 via-[#2b1b15] to-orange-950 shadow-2xl shadow-black/40 md:aspect-[4/3]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(251,146,60,0.22),_transparent_58%)]" />
          <div className="absolute inset-x-8 bottom-4 h-8 rounded-full bg-black/30 blur-xl" />
          {product.product_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.product_image}
              alt={product.product_name}
              className="relative z-10 h-full w-full object-contain p-8 drop-shadow-2xl"
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

        <div className="mt-6 px-1">
          <p className="text-xs font-bold text-orange-200/80">
            {product.categories?.category_name}
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
            {product.product_name}
          </h1>

          {product.product_description && (
            <p className="mt-4 text-sm leading-6 text-stone-300">
              {product.product_description}
            </p>
          )}

          <div className="mt-6 inline-block rounded-3xl bg-white/10 px-6 py-4 ring-1 ring-white/10">
            <p className="text-xs font-bold text-stone-400">Precio</p>
            <p className="mt-1 text-3xl font-black text-orange-200">
              {formatPrice(product.product_price)}
            </p>
          </div>
        </div>
      </section>

      <FloatingCartButton />
    </main>
  )
}
