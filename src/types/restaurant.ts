export type MenuTemplate = "noche" | "aurora" | "cyber-ruby" | "eclipse" | "forest-moss" | "nordic-minimal"

export type OrderDestination = "waiter" | "kitchen"

export type OutputMode = "none" | "printer" | "screen"

export type ReservationContactType = "none" | "whatsapp"

// Modo de control de disponibilidad por stock:
//   'block' = el stock oculta/bloquea productos (según insumos críticos).
//   'info'  = el stock nunca oculta ni bloquea; solo alimenta las alertas.
export type StockMenuMode = "block" | "info"
export type FulfillmentType = "home_delivery" | "pickup"

export type PublicRestaurant = {
  id: number
  restaurant_name: string
  restaurant_logo: string | null
  menu_template: MenuTemplate
  location_check_enabled?: boolean
}

export type Restaurant = PublicRestaurant & {
  order_destination: OrderDestination
  output_mode: OutputMode
  printer_bluetooth_name: string | null
  restaurant_city: string | null
  delivery_enabled: boolean
  delivery_slug: string | null
  delivery_home_enabled: boolean
  pickup_enabled: boolean
  delivery_online_payment_enabled: boolean
  delivery_pay_at_store_enabled: boolean
  reservation_contact_type: ReservationContactType
  reservation_whatsapp: string | null
  reservation_duration_minutes: number
  stock_menu_mode: StockMenuMode
  location_check_enabled: boolean
  location_latitude: number | null
  location_longitude: number | null
  location_accuracy_m?: number | null
  location_radius_m: number
}
