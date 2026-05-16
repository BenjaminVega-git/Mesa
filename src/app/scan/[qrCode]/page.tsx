"use client"

import { use, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type ScanStatus = "loading" | "success" | "error"

function getNumberParam(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key))
  return Number.isFinite(value) && value > 0 ? value : null
}

export default function ScanOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrCode: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { qrCode } = use(params)
  const rawSearchParams = use(searchParams)
  const query = useMemo(() => {
    const nextQuery = new URLSearchParams()

    Object.entries(rawSearchParams).forEach(([key, value]) => {
      if (typeof value === "string") nextQuery.set(key, value)
    })

    return nextQuery
  }, [rawSearchParams])

  const [status, setStatus] = useState<ScanStatus>("loading")
  const [message, setMessage] = useState("Registrando pedido...")

  useEffect(() => {
    let isMounted = true

    async function registerOrder() {
      const tableId = getNumberParam(query, "tableId")
      const restaurantId = getNumberParam(query, "restaurantId")
      const total = getNumberParam(query, "total")

      if (!tableId || !restaurantId || !total) {
        setStatus("error")
        setMessage("El QR no contiene los datos del pedido.")
        return
      }

      const { data: qrData, error: qrError } = await supabase
        .from("order_qr_codes")
        .select("id, qr_active")
        .eq("qr_code", qrCode)
        .maybeSingle()

      if (qrError || !qrData) {
        setStatus("error")
        setMessage("No se encontro el QR del pedido.")
        return
      }

      const { data: existingOrder, error: existingOrderError } = await supabase
        .from("orders")
        .select("id")
        .eq("qr_code_id", qrData.id)
        .maybeSingle()

      if (existingOrderError) {
        setStatus("error")
        setMessage("No se pudo revisar el estado del pedido.")
        return
      }

      if (existingOrder) {
        setStatus("success")
        setMessage("Pedido registrado")
        return
      }

      if (!qrData.qr_active) {
        setStatus("error")
        setMessage("Este QR ya no esta activo.")
        return
      }

      const { error: insertError } = await supabase.from("orders").insert({
        total,
        table_id: tableId,
        restaurant_id: restaurantId,
        qr_code_id: qrData.id,
        status_id: 1,
      })

      if (insertError) {
        setStatus("error")
        setMessage(
          insertError.code === "42501"
            ? "Supabase esta bloqueando el registro del pedido por permisos."
            : "No se pudo registrar el pedido."
        )
        return
      }

      await supabase
        .from("order_qr_codes")
        .update({ qr_active: false })
        .eq("id", qrData.id)

      if (isMounted) {
        setStatus("success")
        setMessage("Pedido registrado")
      }
    }

    registerOrder()

    return () => {
      isMounted = false
    }
  }, [qrCode, query])

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 px-5 text-white">
      <section className="w-full max-w-sm rounded-[2rem] bg-white/10 px-6 py-8 text-center shadow-2xl shadow-black/30 ring-1 ring-white/10">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-black ring-1 ${
            status === "success"
              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-200/30"
              : status === "error"
                ? "bg-red-500/15 text-red-200 ring-red-200/30"
                : "bg-orange-500/15 text-orange-200 ring-orange-200/30"
          }`}
        >
          {status === "success" ? "OK" : status === "error" ? "!" : "..."}
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight">{message}</h1>
      </section>
    </main>
  )
}
