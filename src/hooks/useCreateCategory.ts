"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export function useCreateCategory() {
  const router = useRouter()

  const [categoryName, setCategoryName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function createCategory(e: React.FormEvent) {
    e.preventDefault()

    try {
      setLoading(true)
      setError("")

      const cleanCategoryName = categoryName.trim()

      if (!cleanCategoryName) {
        throw new Error("El nombre de la categoría es obligatorio")
      }

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error("Usuario no autenticado")
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("restaurant_id")
        .eq("auth_user_id", user.id)
        .single()

      if (profileError || !profile) {
        throw new Error("No se encontró el restaurante del usuario")
      }

      const { error: categoryError } = await supabase
        .from("categories")
        .insert({
          category_name: cleanCategoryName,
          restaurant_id: profile.restaurant_id
        })

      if (categoryError) {
        throw categoryError
      }

      router.replace("/admin/categories")

    } catch (err: any) {
      console.log(err)
      setError(err.message || "Error al crear categoría")
    } finally {
      setLoading(false)
    }
  }

  return {
    categoryName,
    setCategoryName,
    loading,
    error,
    createCategory
  }
}