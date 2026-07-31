import { useCallback, useState } from "react"
import type { CartItem } from "@/types/cart-item"
import { useCartStore } from "@/store/cartStore"
import { useTableCartStore } from "@/store/tableCartStore"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"
import { handleMutationError } from "@/lib/hooks/handle-mutation-error"
import { createOrderAction } from "@/app/actions/order-actions"
import type { CreateOrderItemInput } from "@/lib/validation/order"
import { getOrCreateDinerToken } from "@/lib/diner-token"
import { TABLE_ORDER_CREATED_EVENT } from "@/hooks/useTableOrders"

type UseCreateOrderProps = {
  items: CartItem[]
  tableId: number
  restaurantId: number
  couponCode?: string | null
}

const ORDER_SUBMIT_COOLDOWN_MS = 3000
const lastSubmitByTable = new Map<number, number>()

function getSubmitCooldownKey(tableId: number) {
  return `order-submit-cooldown-${tableId}`
}

function getLastSubmitAt(tableId: number): number {
  const memoryValue = lastSubmitByTable.get(tableId) ?? 0
  if (typeof window === "undefined") return memoryValue

  try {
    const stored = Number(window.localStorage.getItem(getSubmitCooldownKey(tableId)) ?? 0)
    return Math.max(memoryValue, Number.isFinite(stored) ? stored : 0)
  } catch {
    return memoryValue
  }
}

function markSubmitAt(tableId: number, timestamp: number) {
  lastSubmitByTable.set(tableId, timestamp)
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(getSubmitCooldownKey(tableId), String(timestamp))
  } catch {
    // ignore
  }
}

export function useCreateOrder({ items, tableId, restaurantId, couponCode }: UseCreateOrderProps) {
  const clearCart = useTableCartStore((state) => state.clear)
  const fetchItems = useTableCartStore((state) => state.fetchItems)
  // Credencial pública de la mesa: las RPC ya no aceptan table_id.
  const qrCode = useTableCartStore((state) => state.qrCode)
  const setLastOrder = useCartStore((state) => state.setLastOrder)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { run: createOrderWithRetry, isPending } = useOfflineRetry(async () => {
    const orderItems: CreateOrderItemInput[] = items.map((item) => ({
      productId: item.productId ?? null,
      variantId: item.variantId ?? null,
      promotionId: item.promotionId ?? null,
      selections: item.selections ?? null,
      ingredientChoices: item.ingredientChoices ?? null,
      menuOptionChoices: item.menuOptionChoices ?? null,
      productQuantity: item.quantity,
      notes: item.notes ?? null,
    }))

    const dinerToken = getOrCreateDinerToken(tableId)

    if (!qrCode) {
      throw new Error("No se pudo identificar la mesa del pedido.")
    }

    const result = await createOrderAction({
      qrToken: qrCode,
      dinerToken,
      couponCode: couponCode ?? null,
      items: orderItems,
    })

    if (!result.ok) {
      throw new Error(result.error)
    }

    setLastOrder({
      id: result.data.id,
      statusId: result.data.statusId,
      statusName: result.data.statusName ?? "Nuevo",
      createdAt: result.data.createdAt,
      tableId: result.data.tableId,
      restaurantId: result.data.restaurantId,
      total: result.data.total,
    })

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(TABLE_ORDER_CREATED_EVENT, { detail: result.data }))
    }

    await clearCart()
  })

  async function createOrder() {
    if (!items.length) return
    if (!tableId || !restaurantId) {
      setError("No se pudo identificar la mesa del pedido.")
      return
    }
    const now = Date.now()
    const lastSubmitAt = getLastSubmitAt(tableId)
    if (now - lastSubmitAt < ORDER_SUBMIT_COOLDOWN_MS) {
      setError("El pedido ya se esta enviando. Espera unos segundos.")
      return
    }

    markSubmitAt(tableId, now)
    setIsLoading(true)
    setError(null)

    try {
      await createOrderWithRetry()
    } catch (err) {
      await fetchItems()
      handleMutationError(err, {
        logTag: "Error creando pedido",
        fallback: "Error al crear el pedido, intenta de nuevo.",
        setError,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const resetOrderDraft = useCallback(() => {
    setError(null)
  }, [])

  return {
    isLoading: isLoading || isPending,
    isWaitingConnection: isPending,
    error,
    createOrder,
    resetOrderDraft,
  }
}
