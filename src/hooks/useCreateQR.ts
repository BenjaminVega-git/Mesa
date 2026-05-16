import { supabase } from "@/lib/supabase"
import { nanoid } from "nanoid"

type QrTable = "table_qr_codes" | "order_qr_codes"

export async function createQR(table: QrTable) {
  const qrCode = nanoid(8)

  const { data, error } = await supabase
    .from(table)
    .insert({ qr_code: qrCode, qr_active: true })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createOrderQR() {
  const qrCode = nanoid(8)

  const { error } = await supabase
    .from("order_qr_codes")
    .insert({ qr_code: qrCode, qr_active: true })

  if (error) throw error
  return qrCode
}
