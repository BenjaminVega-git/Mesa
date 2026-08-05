import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRestaurantId } from "@/hooks/useRestaurantId"
import { useCache } from "@/hooks/useCache"
import type { Restaurant } from "@/types/restaurant"

export function useRestaurant() {
  const { restaurantId, loading: loadingId } = useRestaurantId()

  const fetchRestaurant = useCallback(async (): Promise<Restaurant> => {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, restaurant_name, restaurant_logo, menu_template, order_destination, output_mode, printer_bluetooth_name, restaurant_city, delivery_enabled, delivery_slug, delivery_home_enabled, pickup_enabled, delivery_online_payment_enabled, delivery_pay_at_store_enabled, reservation_contact_type, reservation_whatsapp, reservation_duration_minutes, stock_menu_mode, location_check_enabled, location_latitude, location_longitude, location_accuracy_m, location_radius_m")
      .eq("id", restaurantId)
      .single()

    if (error) throw error

    return data
  }, [restaurantId])

  const { data, isLoading, isPendingRetry, error, refresh } = useCache<Restaurant>(
    `restaurant-${restaurantId ?? "pending"}`,
    fetchRestaurant,
    {
      enabled: Boolean(restaurantId),
      revalidateOnMount: true,
      revalidateOnFocus: true,
    }
  )

  return {
    restaurant: data,
    loading: loadingId || isLoading || isPendingRetry,
    error: error ? "No se pudo obtener el restaurante" : "",
    refresh,
  }
}
