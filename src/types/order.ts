export type Order = {
  id: number
  table_id: number
  total: number
  status_id: number
  created_at: string
  order_status: { nombre: string }[]
  tables: { name: string }[]
  order_qr_codes: { qr_code: string; qr_active: boolean } | null
}