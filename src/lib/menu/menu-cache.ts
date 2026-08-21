import { revalidatePath, revalidateTag } from "next/cache"

export const PUBLIC_MENU_TAG = "menu"

export function menuTag(restaurantId: number | string): string {
  return `menu-restaurant-${restaurantId}`
}

export function revalidatePublicMenu(restaurantId: number | string) {
  revalidateTag(PUBLIC_MENU_TAG, "max")
  revalidateTag(menuTag(restaurantId), "max")
  revalidatePath("/[id]/menu", "page")
}
