"use client"

import { useState } from "react"
import type { MenuPromotion } from "@/types/menu"
import type { Product } from "@/types/product"
import type { CartPromoSelection } from "@/types/cart-item"
import { BuildPromoDialog } from "@/components/customer/BuildPromoDialog"

function formatPrice(price: number) {
  return `$${Math.round(price).toLocaleString("es-CL")}`
}

function discountPct(original: number, promo: number) {
  if (!original || original <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((1 - promo / original) * 100)))
}

function configurableDiscountLabel(promo: MenuPromotion) {
  return promo.discount_type === "amount"
    ? `${formatPrice(promo.discount_amount ?? 0)} OFF`
    : `${promo.discount_pct ?? 0}% OFF`
}

type AddPromo = (
  id: number,
  quantity?: number,
  selections?: CartPromoSelection[] | null
) => void | Promise<void>

function PromoCard({
  promo,
  products,
  onAdd,
}: {
  promo: MenuPromotion
  products: Product[]
  onAdd: AddPromo
}) {
  const [added, setAdded] = useState(false)
  const [building, setBuilding] = useState(false)
  const isConfigurable = promo.kind === "build" || promo.kind === "mixed"
  // En build/mixed el % lo fija el local y se aplica sobre el combo calculado;
  // en fixed se deriva del precio de carta vs el precio de promo.
  const pct = isConfigurable ? 0 : discountPct(promo.original_total, promo.promo_price)
  const discountLabel = isConfigurable ? configurableDiscountLabel(promo) : `${pct}% OFF`

  async function handleAddFixed() {
    try {
      await onAdd(promo.id)
      setAdded(true)
      setTimeout(() => setAdded(false), 1500)
    } catch {
      // el store ya loguea; no rompemos la card
    }
  }

  const includes = isConfigurable
    ? [
        promo.kind === "mixed"
          ? promo.items.map((it) => `${it.quantity}× ${it.product_name}`).join(" · ")
          : null,
        promo.groups.map((g) => g.name).join(" · "),
      ].filter(Boolean).join(" · ")
    : promo.items
        .map((it) => `${it.quantity}× ${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ""}`)
        .join(" · ")

  return (
    <>
      <div className="flex w-[260px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#27272a] bg-[#18181b]">
        <div className="relative h-28 w-full bg-gradient-to-br from-[#fb923c]/25 to-[#7c2d12]/20">
          {promo.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={promo.image_url} alt={promo.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl">{isConfigurable ? "🍔" : "🏷️"}</div>
          )}
          {(isConfigurable || pct > 0) && (
            <span className="absolute top-2 left-2 rounded-full bg-[#fb923c] px-2 py-0.5 text-[11px] font-black text-[#1a1a1a]">
              {discountLabel}
            </span>
          )}
          {isConfigurable && (
            <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-[#fafafa] backdrop-blur">
              {promo.kind === "mixed" ? "Mixta" : "Armá el tuyo"}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          <h3 className="truncate text-[15px] font-extrabold text-[#fafafa]">{promo.name}</h3>
          <p className="line-clamp-2 min-h-[2rem] text-[12px] leading-4 text-[#a1a1aa]">
            {promo.description || includes}
          </p>

          <div className="mt-1 flex items-end gap-2">
            {isConfigurable ? (
              promo.min_price != null && promo.min_price > 0 ? (
                <>
                  <span className="text-[12px] text-[#71717a]">desde</span>
                  <span className="text-[18px] font-black text-[#fb923c]">
                    {formatPrice(promo.min_price)}
                  </span>
                </>
              ) : (
                <span className="text-[15px] font-black text-[#fb923c]">
                  {discountLabel} en tu combo
                </span>
              )
            ) : (
              <>
                {pct > 0 && (
                  <span className="text-[12px] text-[#71717a] line-through">
                    {formatPrice(promo.original_total)}
                  </span>
                )}
                <span className="text-[18px] font-black text-[#fb923c]">
                  {formatPrice(promo.promo_price)}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={isConfigurable ? () => setBuilding(true) : handleAddFixed}
            className={`mt-2 flex h-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-extrabold transition active:scale-[0.98] ${
              added ? "bg-emerald-500 text-[#052e16]" : "bg-[#fb923c] text-[#1a1a1a]"
            }`}
          >
            {added ? "Agregado ✓" : isConfigurable ? "Armar combo" : "Agregar promo"}
          </button>
        </div>
      </div>

      {building && (
        <BuildPromoDialog
          promo={promo}
          products={products}
          onClose={() => setBuilding(false)}
          onConfirm={async (selections, quantity) => {
            await onAdd(promo.id, quantity, selections)
          }}
        />
      )}
    </>
  )
}

export function PromotionsSection({
  promotions,
  products,
  onAdd,
}: {
  promotions: MenuPromotion[]
  products: Product[]
  onAdd: AddPromo
}) {
  if (!promotions || promotions.length === 0) return null

  return (
    <section className="px-4 pt-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[16px]">🔥</span>
        <h2 className="text-[16px] font-black tracking-tight text-[#fafafa]">Promociones</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {promotions.map((promo) => (
          <PromoCard key={promo.id} promo={promo} products={products} onAdd={onAdd} />
        ))}
      </div>
    </section>
  )
}
