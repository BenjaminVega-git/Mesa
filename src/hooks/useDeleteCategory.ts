import { useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"

export function useDeleteCategory() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const categoryIdRef = useRef<number | null>(null)

  const { run: deleteCategoryWithRetry, isPending } = useOfflineRetry(async () => {
    if (!categoryIdRef.current) return false

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", categoryIdRef.current)

    if (error) throw error

    return true
  })

  async function deleteCategory(categoryId: number) {
    const confirmed = confirm("Seguro que quieres eliminar esta categoria?")

    if (!confirmed) return false

    try {
      categoryIdRef.current = categoryId
      setLoading(true)
      setError("")

      return await deleteCategoryWithRetry()
    } catch (err: unknown) {
      logger.error("Error eliminando categoria", err)
      setError("Error al eliminar categoria")
      return false
    } finally {
      setLoading(false)
    }
  }

  return {
    loading: loading || isPending,
    error,
    deleteCategory
  }
}
