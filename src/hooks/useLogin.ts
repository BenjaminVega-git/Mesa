"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export function useLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function login(
    e: React.FormEvent
  ) {

    e.preventDefault()

    try {

      setLoading(true)
      setError("")

      const {
        data,
        error
      } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        throw error
      }

      console.log("Login correcto")
      console.log(data)


      router.push("/admin")

    } catch (err: any) {

      console.log(err)
      setError(err.message)

    } finally {

      setLoading(false)

    }
  }

  return {

    email,
    setEmail,

    password,
    setPassword,

    loading,
    error,

    login
  }
}