import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { decodeId } from "@/lib/hashids"

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useEditCategory() {
  const router = useRouter()
  const params = useParams()

  const categoryId = decodeId(params.id as string)

  const [categoryName, setCategoryName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadCategory() {
      try {
        setLoading(true)
        setLoadError("")
        setError("")

        if (!categoryId) {
          throw new Error("Categoría no encontrada")
        }

        const { data, error } = await supabase
          .from("categories")
          .select("id, category_name")
          .eq("id", categoryId)
          .maybeSingle()

        if (error) throw error
        if (!data) throw new Error("Categoría no encontrada")

        setCategoryName(data.category_name)
      } catch (err: unknown) {
        logger.error("Error cargando categoría", {
          error: err,
          categoryId,
          rawParamId: params.id,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        setLoadError(getErrorMessage(err, "Error al cargar categoría"))
      } finally {
        setLoading(false)
      }
    }

    loadCategory()
  }, [categoryId])

  async function updateCategory(trimmedName: string) {
    if (saving) return

    try {
      setSaving(true)
      setError("")

      const cleanCategoryName = trimmedName.trim()

      if (!cleanCategoryName) {
        throw new Error("El nombre de la categoría es obligatorio")
      }

      const { error } = await supabase
        .from("categories")
        .update({ category_name: cleanCategoryName })
        .eq("id", categoryId)

      if (error) throw error

      router.replace("/admin/categories")
    } catch (err: unknown) {
      logger.error("Error actualizando categoría", {
        error: err,
        categoryId,
        rawParamId: params.id,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
      setError(getErrorMessage(err, "Error al guardar cambios"))
    } finally {
      setSaving(false)
    }
  }

  return {
    categoryName,
    setCategoryName,
    loading,
    saving,
    loadError,
    error,
    updateCategory
  }
}