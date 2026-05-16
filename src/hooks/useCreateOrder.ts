import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { CartItem } from "@/types/cart-item"
import { createOrderQR } from "@/hooks/useCreateQR"
import { getSafeErrorMessage } from "@/lib/safe-error"

type UseCreateOrderProps = {
  items: CartItem[]
  tableId: number
  restaurantId: number
}

export function useCreateOrder({ items, tableId, restaurantId }: UseCreateOrderProps) {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const orderQrCode = await createOrderQR()
      setQrCode(orderQrCode)
    } catch (err) {
      setError(getCreateQrErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  async function cancelOrder() {
    if (!qrCode) return

    await supabase
      .from("order_qr_codes")
      .update({ qr_active: false })
      .eq("qr_code", qrCode)

    setQrCode(null)
  }

  return { qrCode, isLoading, error, createOrder, cancelOrder }
}