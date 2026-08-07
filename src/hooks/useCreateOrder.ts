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
import { supabase } from "@/lib/supabase"

type UseCreateOrderProps = {
  items: CartItem[]
  tableId: number
  restaurantId: number
  couponCode?: string | null
  locationCheckEnabled?: boolean
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

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Necesitamos tu ubicación para enviar pedidos desde esta mesa. Activa el permiso en el navegador."
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "No se pudo calcular tu ubicación. Acércate a la mesa o pide ayuda a un mesero."
  }
  if (error.code === error.TIMEOUT) {
    return "Tu ubicación tardó demasiado en responder. Mantén el GPS activo y espera unos segundos antes de reintentar."
  }
  return "Necesitamos tu ubicación GPS para enviar pedidos desde esta mesa."
}

function getBrowserLocation(): Promise<{ latitude: number; longitude: number; accuracyM: number | null }> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      reject(new Error("El navegador solo permite validar ubicación con HTTPS. Abre el menú desde una URL segura."))
      return
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Este dispositivo no permite validar tu ubicación. Pide ayuda a un mesero."))
      return
    }

    let bestPosition: GeolocationPosition | null = null
    let watchId: number | null = null
    let finished = false
    const finish = (position: GeolocationPosition | null, error?: GeolocationPositionError) => {
      if (finished) return
      finished = true
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      window.clearTimeout(timeoutId)

      if (!position) {
        reject(new Error(error ? getGeolocationErrorMessage(error) : "No se pudo obtener tu ubicación GPS."))
        return
      }

      resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      })
    }

    const timeoutId = window.setTimeout(() => finish(bestPosition), 10000)
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy
        if (
          bestPosition == null ||
          (Number.isFinite(accuracy) && (!Number.isFinite(bestPosition.coords.accuracy) || accuracy < bestPosition.coords.accuracy))
        ) {
          bestPosition = position
        }

        // Do not submit the first coarse cell/IP estimate. Finish early only
        // once the phone reports a useful reading; otherwise use the best
        // reading collected during the short observation window.
        if (Number.isFinite(accuracy) && accuracy <= 50) finish(position)
      },
      (error) => finish(bestPosition, error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

async function getCustomerLocationIfRequired(qrCode: string, locationCheckEnabled?: boolean) {
  if (locationCheckEnabled) {
    return getBrowserLocation()
  }

  const { data, error } = await supabase.rpc("qr_order_location_required", {
    p_qr_token: qrCode,
  })

  if (error) {
    return getBrowserLocation()
  }
  if (!data) return null

  return getBrowserLocation()
}

export function useCreateOrder({ items, tableId, restaurantId, couponCode, locationCheckEnabled }: UseCreateOrderProps) {
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

    const customerLocation = await getCustomerLocationIfRequired(qrCode, locationCheckEnabled)

    const result = await createOrderAction({
      qrToken: qrCode,
      dinerToken,
      couponCode: couponCode ?? null,
      customerLocation,
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
