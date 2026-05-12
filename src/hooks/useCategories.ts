"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export function useCategories() {

  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {

    async function loadCategories() {

      try {

        setLoading(true)
        setError("")

        const {
          data: { user }
        } = await supabase.auth.getUser()

        if (!user) {
          throw new Error("Usuario no autenticado")
        }

        const { data: profile, error: profileError } =
          await supabase
            .from("users")
            .select("restaurant_id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError) {
          throw profileError
        }

        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .eq("restaurant_id", profile.restaurant_id)

        if (error) {
          throw error
        }

        setCategories(data || [])

      } catch (err: any) {

        console.log(err)
        setError(err.message)

      } finally {

        setLoading(false)
      }
    }

    loadCategories()

  }, [])

  return {
    categories,
    loading,
    error
  }
}