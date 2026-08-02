import { createBrowserClient } from "@supabase/ssr"

export const supabase = createBrowserClient(
  getBrowserSupabaseUrl(),
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getBrowserSupabaseUrl() {
  if (
    process.env.NEXT_PUBLIC_MESA_SUPABASE_PROXY === "1" &&
    typeof window !== "undefined"
  ) {
    return `${window.location.origin}/supabase`
  }

  return process.env.NEXT_PUBLIC_SUPABASE_URL!
}
