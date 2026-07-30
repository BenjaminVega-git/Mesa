import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

export type RestaurantTable = {
  id: number
  tableNumber: number | null
  currentWaiterId: number | null
}


export function useRestaurantTables(restaurantId: number | null) {
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)

  const restaurantIdRef = useRef(restaurantId)
  useEffect(() => {
    restaurantIdRef.current = restaurantId
  }, [restaurantId])

  const fetchTables = useCallback(async () => {
    const rid = restaurantIdRef.current
    if (!rid) {
      setTables([])
      return
    }
    const { data, error } = await supabase
      .from("tables")
      .select("id, table_number, current_waiter_id")
      .eq("restaurant_id", rid)
      .neq("table_number", 0)
      .order("table_number", { ascending: true })

    if (error) {
      logger.error("Error cargando mesas del restaurante", error)
      return
    }
    setTables(
      (data ?? []).map((row) => ({
        id: row.id,
        tableNumber: row.table_number,
        currentWaiterId: row.current_waiter_id,
      }))
    )
  }, [])

 useEffect(() => {
    if (!restaurantId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al cambiar/quitar restaurantId
      setTables([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchTables().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [restaurantId, fetchTables])

  useEffect(() => {
    if (!restaurantId) return

    const refetch = () => {
      fetchTables().catch(() => undefined)
    }

    const channel = supabase
      .channel(`restaurant-tables-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tables",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        refetch
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, fetchTables])

  return { tables, loading, refresh: fetchTables }
}
