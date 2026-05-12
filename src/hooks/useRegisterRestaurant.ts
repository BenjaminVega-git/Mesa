"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export function useRegisterRestaurant() {
  const router = useRouter()

  const [restaurantName, setRestaurantName] = useState("")
  const [adminName, setAdminName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function registerRestaurant(e: React.FormEvent) {
    e.preventDefault()

    try {
      setLoading(true)
      setError("")

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            admin_name: adminName,
            restaurant_name: restaurantName
          }
        }
      })

      if (authError) {
        throw authError
      }

      console.log("Registro completado")
      console.log(data)

      router.replace("/login")

    } catch (err: any) {
      console.log(err)
      setError(err.message || "Error al registrar restaurante")
    } finally {
      setLoading(false)
    }
  }

  return {
    restaurantName,
    setRestaurantName,

    adminName,
    setAdminName,

    email,
    setEmail,

    password,
    setPassword,

    loading,
    error,

    registerRestaurant
  }
}