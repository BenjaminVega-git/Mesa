import { notFound } from "next/navigation"
import { createSupabaseAnonClient } from "@/lib/supabase/anon"
import { DeliveryMenuClient, type DeliveryMenuData } from "./DeliveryMenuClient"

type Params = Promise<{ slug: string }>

export const revalidate = 60

export default async function DeliveryRestaurantPage({ params }: { params: Params }) {
  const { slug } = await params
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) notFound()

  const supabase = createSupabaseAnonClient()
  const [{ data, error }, { data: paymentProvider }] = await Promise.all([
    supabase.rpc("get_restaurant_by_slug", { p_slug: slug }),
    supabase.rpc("delivery_payment_available", { p_slug: slug }),
  ])
  if (error || !data) notFound()

  return (
    <DeliveryMenuClient
      data={data as unknown as DeliveryMenuData}
      paymentProvider={typeof paymentProvider === "string" ? paymentProvider : null}
    />
  )
}
