import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { CartItem } from "@/types/cart-item"
import { createOrderQR } from "@/hooks/useCreateQR"
import { getSafeErrorMessage } from "@/lib/safe-error"
import { isNetworkError, useOfflineRetry } from "@/hooks/useOfflineRetry"

type UseCreateOrderProps = {
  items: CartItem[]
  tableId: number
  restaurantId: number
}

export function useCreateOrder({ items, tableId, restaurantId }: UseCreateOrderProps) {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { run: createOrderQrWithRetry, isPending: isCreateRetryPending } =
    useOfflineRetry(async () => {
      const orderQrCode = await createOrderQR()
      setQrCode(orderQrCode)
    })

  const { run: cancelOrderWithRetry, isPending: isCancelRetryPending } =
    useOfflineRetry(async () => {
      if (!qrCode) return

      const { error } = await supabase
        .from("order_qr_codes")
        .update({ qr_active: false })
        .eq("qr_code", qrCode)

      if (error) throw error
      setQrCode(null)
    })

  function getCreateQrErrorMessage(err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "42501"
    ) {
      return "Supabase esta bloqueando la creacion del QR por permisos."
    }

    return getSafeErrorMessage(err, "Error al crear el pedido, intenta de nuevo.", [])
  }

  async function createOrder() {
    if (!items.length) return
    if (!tableId || !restaurantId) {
      setError("No se pudo identificar la mesa del pedido.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await createOrderQrWithRetry()
    } catch (err) {
      if (isNetworkError(err)) return
      setError(getCreateQrErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  async function cancelOrder() {
    if (!qrCode) return

    try {
      await cancelOrderWithRetry()
    } catch (err) {
      setError(getSafeErrorMessage(err, "Error al cancelar el pedido.", []))
    }
  }

  return {
    qrCode,
    isLoading: isLoading || isCreateRetryPending || isCancelRetryPending,
    isWaitingConnection: isCreateRetryPending,
    error,
    createOrder,
    cancelOrder,
  }
}
