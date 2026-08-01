import type { OrderStatus } from "@/types/order-status"

export type Order = {
  id: number
  // Correlativo por restaurante (Pedido #1, #2...). Null en pedidos sin restaurant_id.
  order_number: number | null
  table_id: number | null
  order_type: "dine_in" | "delivery" | null
  delivery_customer_name: string | null
  total: number
  status_id: number
  created_at: string
  order_status: OrderStatus | null
  tables: { table_number: number | null }[] | null
}
