"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export function useEditCategory() {
  const router = useRouter()
  const params = useParams()

  const categoryId = Number(params.id)

  const [categoryName, setCategoryName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadCategory() {
      try {
        setLoading(true)
        setError("")

        const { data, error } = await supabase
          .from("categories")
          .select("id, category_name")
          .eq("id", categoryId)
          .single()

        if (error) {
          throw error
        }

        setCategoryName(data.category_name)

      } catch (err: any) {
        console.log(err)
        setError(err.message || "Error al cargar categoría")
      } finally {
        setLoading(false)
      }
    }

    if (categoryId) {
      loadCategory()
    }
  }, [categoryId])

  async function updateCategory(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setError("")

      const cleanCategoryName = categoryName.trim()

      if (!cleanCategoryName) {
        throw new Error("El nombre de la categoría es obligatorio")
      }

      const { error } = await supabase
        .from("categories")
        .update({
          category_name: cleanCategoryName
        })
        .eq("id", categoryId)

      if (error) {
        throw error
      }

      router.replace("/admin/categories")

    } catch (err: any) {
      console.log(err)
      setError(err.message || "Error al guardar cambios")
    } finally {
      setSaving(false)
    }
  }

  return {
    categoryName,
    setCategoryName,
    loading,
    saving,
    error,
    updateCategory
  }
}