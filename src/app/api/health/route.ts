import { NextResponse } from "next/server"
import { APP_VERSION } from "@/lib/app-version"

export const dynamic = "force-dynamic"

/**
 * Endpoint mínimo para comprobar que un deployment está sirviendo la app.
 * No consulta Supabase ni expone configuración sensible.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "mesa", version: APP_VERSION },
    { headers: { "Cache-Control": "no-store" } },
  )
}
