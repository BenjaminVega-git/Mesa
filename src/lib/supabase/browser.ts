import { createBrowserClient } from "@supabase/ssr"
import { SUPABASE_AUTH_COOKIE } from "./cookie"

export const supabase = createBrowserClient(
  getBrowserSupabaseUrl(),
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      name: SUPABASE_AUTH_COOKIE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
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
