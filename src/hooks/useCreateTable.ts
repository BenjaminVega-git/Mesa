import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { useRestaurantId } from "@/hooks/useRestaurantId"
import { createQR } from "@/hooks/useCreateQR"
import { getSafeErrorMessage } from "@/lib/safe-error"

const safeErrors = [
  "El número de mesa debe ser mayor a 0",
  "No se encontró el restaurante"
]

export function useCreateTable() {
  const router = useRouter()
  const { restaurantId, loading: loadingId } = useRestaurantId()

  const [tableNumber, setTableNumber] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function createTable() {
    if (loading || loadingId) return

    try {
      setLoading(true)
      setError("")

      const cleanNumber = Number(tableNumber)

      if (!cleanNumber || cleanNumber <= 0) {
        throw new Error("El número de mesa debe ser mayor a 0")
      }

      if (!restaurantId) {
        throw new Error("No se encontró el restaurante")
      }

      const qrData = await createQR("table_qr_codes")
      
      const { error: tableError } = await supabase
        .from("tables")
        .insert({
          table_number: cleanNumber,
          restaurant_id: restaurantId,
          qr_code_id: qrData.id
        })

      if (tableError) throw tableError

      router.replace("/admin/tables")
    } catch (err: unknown) {
      logger.error("Error creando mesa", err)
      setError(getSafeErrorMessage(err, "Error al crear mesa", safeErrors))
    } finally {
      setLoading(false)
    }
  }

  return {
    tableNumber,
    setTableNumber,
    loading,
    error,
    createTable
  }
}