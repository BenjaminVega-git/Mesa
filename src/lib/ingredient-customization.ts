import type { ProductIngredientOption } from "@/types/product"
import type { CartIngredientChoice } from "@/types/cart-item"

/** Suma de extras elegidos (los "quitar" no cambian el precio). */
export function calcIngredientExtra(
  choices: CartIngredientChoice[] | null | undefined,
  options: ProductIngredientOption[] | null | undefined
): number {
  if (!choices?.length || !options?.length) return 0
  return choices.reduce((sum, c) => {
    if (c.action !== "add") return sum
    const opt = options.find((o) => o.ingredient_id === c.ingredientId && o.kind === "extra")
    return sum + (opt?.extra_price ?? 0)
  }, 0)
}

/** "Sin Tomate, Extra Queso (+$500)" — mismo formato que arma la RPC. */
export function describeIngredientChoices(
  choices: CartIngredientChoice[] | null | undefined,
  options: ProductIngredientOption[] | null | undefined
): string | null {
  if (!choices?.length || !options?.length) return null
  const parts = choices
    .map((c) => {
      const opt = options.find(
        (o) => o.ingredient_id === c.ingredientId && o.kind === (c.action === "remove" ? "removable" : "extra")
      )
      if (!opt) return null
      return c.action === "remove" ? `Sin ${opt.name}` : `Extra ${opt.name} (+$${opt.extra_price})`
    })
    .filter((s): s is string => Boolean(s))
  return parts.length > 0 ? parts.join(", ") : null
}
