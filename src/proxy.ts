import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { SUPABASE_AUTH_COOKIE } from "@/lib/supabase/cookie"

// Cache por cookie del chequeo A-2 (must_change_password). TTL corto: recorta el
// RPC del hot path sin abrir una ventana de seguridad relevante (ver abajo).
const MUST_CHANGE_OK_COOKIE = "mc_ok"
const MUST_CHANGE_OK_TTL_SECONDS = 120

export async function proxy(req: NextRequest) {
  // Respuesta inicial mutable: si Supabase rota el JWT durante getUser(),
  // los cookies actualizados se setean acá vía setAll y propagan al navegador.
  let response = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: SUPABASE_AUTH_COOKIE,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          )
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Solo validamos auth en el middleware. El check de rol/restaurante vive en
  // AdminGuard (cliente) y en cada Server Action que llama el panel. Hacerlo
  // acá agregaba una query a `users` extra por navegación que es propensa a
  // race conditions con el refresh del JWT y patea al usuario a /login sin
  // motivo. Si auth.getUser() acepta el JWT, confiamos.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const path = req.nextUrl.pathname

  // Las rutas de admin/cocina exigen sesión; las de mesero manejan su propio
  // login público, así que sin sesión no las redirigimos desde acá.
  const requiresAdminAuth = path.startsWith("/admin") || path === "/screen"

  if (!userId) {
    if (requiresAdminAuth) {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    return response
  }

  // Enforcement server-side de A-2: si el usuario debe cambiar su contraseña
  // temporal, se le fuerza a /cambiar-contrasena antes de cualquier ruta
  // protegida. Este chequeo es un RPC de red; para sacarlo del hot path lo
  // cacheamos por cookie (mc_ok=<userId>, TTL 120s) una vez confirmado que NO
  // hay cambio pendiente. NUNCA cacheamos el estado "pendiente": si hay que
  // cambiarla, siempre se redirige. La cookie va atada al userId para no
  // arrastrar el permiso a otra sesión. El login (admin y mesero) ya fuerza el
  // cambio; esto es defensa server-side, así que la ventana de ≤120s sin
  // re-verificar tras un reset del operador es aceptable.
  // Fail-open: si el RPC falla (mustChange null/undefined), no bloqueamos ni
  // cacheamos; se reintenta en la próxima navegación (los datos siguen bajo RLS).
  if (path !== "/cambiar-contrasena") {
    const alreadyOk = req.cookies.get(MUST_CHANGE_OK_COOKIE)?.value === userId
    if (!alreadyOk) {
      const { data: mustChange } = await supabase.rpc("get_my_must_change_password")
      if (mustChange === true) {
        return NextResponse.redirect(new URL("/cambiar-contrasena", req.url))
      }
      if (mustChange === false) {
        response.cookies.set(MUST_CHANGE_OK_COOKIE, userId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: MUST_CHANGE_OK_TTL_SECONDS,
        })
      }
    }
  }

  return response
}


export const config = {
  matcher: [
    "/admin/:path*",
    "/screen",
    "/waiter/control",
    "/waiter/contabilidad",
    "/waiter/soporte",
    "/cambiar-contrasena",
  ],
}
