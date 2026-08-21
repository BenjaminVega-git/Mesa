import { unstable_cache } from "next/cache"
import { createSupabaseAnonClient } from "@/lib/supabase/anon"
import { PUBLIC_MENU_TAG } from "@/lib/menu/menu-cache"
import type { MenuData, MenuPromotion } from "@/types/menu"
import type { PublicRestaurant } from "@/types/restaurant"
import type { Product } from "@/types/product"
import type { Category } from "@/types/category"

type PublicMenuRpcResult = {
  restaurant: PublicRestaurant | null
  categories: Category[] | null
  products: Product[] | null
  promotions: MenuPromotion[] | null
  tableId: number | null
  tableNumber: number | null
  reservation: { ends_at: string } | null
}

async function fetchMenuData(qrCode: string): Promise<MenuData> {
  const supabase = createSupabaseAnonClient()

  // RPC SECURITY DEFINER: anon ya no tiene SELECT sobre tables/table_qr_codes.
  // La función resuelve la mesa por el token del QR y arma el menú completo.
  const { data, error } = await supabase.rpc("get_public_menu", {
    p_qr_token: qrCode,
  })

  if (error || !data) throw new Error("QR no válido")

  const menu = data as unknown as PublicMenuRpcResult
  const { data: locationRequired } = await supabase.rpc("qr_order_location_required", {
    p_qr_token: qrCode,
  })
  const restaurant = menu.restaurant
    ? {
        ...menu.restaurant,
        location_check_enabled: Boolean(locationRequired),
      }
    : null

  return {
    restaurant,
    products: menu.products ?? [],
    categories: menu.categories ?? [],
    promotions: menu.promotions ?? [],
    tableId: menu.tableId ?? null,
    tableNumber: menu.tableNumber ?? null,
    reservation: menu.reservation ?? null,
  }
}

export const getMenuData = unstable_cache(
  fetchMenuData,
  ["menu-data"], // key base, el qrCode se agrega automáticamente como argumento
  {
    revalidate: 300, // 5 minutos
    tags: [PUBLIC_MENU_TAG],
  }
)
