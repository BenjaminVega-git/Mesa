import { useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"

type PendingDeleteTable = {
  tableId: number
  qrCodeId: number
}

export function useDeleteTable() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const pendingDeleteRef = useRef<PendingDeleteTable | null>(null)

  const { run: deleteTableWithRetry, isPending } = useOfflineRetry(async () => {
    const pendingDelete = pendingDeleteRef.current
    if (!pendingDelete) return false

    const { error: tableError } = await supabase
      .from("tables")
      .delete()
      .eq("id", pendingDelete.tableId)

    if (tableError) throw tableError

    const { error: qrError } = await supabase
      .from("table_qr_codes")
      .delete()
      .eq("id", pendingDelete.qrCodeId)

    if (qrError) throw qrError

    return true
  })

  async function deleteTable(tableId: number, qrCodeId: number) {
    const confirmed = confirm("Seguro que quieres eliminar esta mesa?")
    if (!confirmed) return false

    try {
      pendingDeleteRef.current = { tableId, qrCodeId }
      setLoading(true)
      setError("")

      return await deleteTableWithRetry()
    } catch (err: unknown) {
      logger.error("Error eliminando mesa", err)
      setError("Error al eliminar mesa")
      return false
    } finally {
      setLoading(false)
    }
  }

  return { deleteTable, loading: loading || isPending, error }
}
