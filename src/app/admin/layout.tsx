"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AdminLayout({
  children
}: {
  children: React.ReactNode
}) {

  const router = useRouter()

  useEffect(() => {

    async function checkUser() {

      const {
        data: { user },
        error
      } = await supabase.auth.getUser()

      if (!user || error) {

        await supabase.auth.signOut()

        router.replace("/login")

        return
      }

      const {
        data: profile,
        error: profileError
      } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle()

      if (!profile || profileError) {

        await supabase.auth.signOut()

        router.replace("/login")
      }
    }

    checkUser()

    const interval = setInterval(() => {
      checkUser()
    }, 5000)

    return () => clearInterval(interval)

  }, [router])

  return (
    <>
      {children}
    </>
  )
}