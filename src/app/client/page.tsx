"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase"

export default function TestPage() {

  useEffect(() => {

    async function test() {

      const { data, error } =
        await supabase
          .from("restaurants")
          .select("*")

      console.log(data)
      console.log(error)
    }

    test()

  }, [])

  return <div>Test</div>
}