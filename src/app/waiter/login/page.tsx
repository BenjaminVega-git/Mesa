"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { getSessionClaims } from "@/lib/supabase/claims"
import { logger } from "@/lib/logger"
import { isNetworkError } from "@/hooks/useOfflineRetry"
import { getHomeRouteForRole, isAdminRole, roleIdToRole } from "@/lib/waiter-session"
import { clearUserScopedCache } from "@/lib/session-cache"
import { InstallPwaButton } from "@/components/InstallPwaButton"

type View = "login" | "change-password"

const INPUT_CLASS =
  "w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:opacity-50"

function EyeToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
      className="absolute inset-y-0 right-3 flex items-center justify-center text-stone-400 transition hover:text-stone-700"
    >
      {shown ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.55 19.55 0 0 1 5.06-6.06" />
          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.62 19.62 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}

async function fetchProfileRoleIdWithRetry(authUserId: string): Promise<number | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("users")
      .select("role_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle()
    if (!error && data?.role_id != null) return data.role_id
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
  }
  return null
}

export default function WaiterLoginPage() {
  const router = useRouter()

  const [view, setView] = useState<View>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sessionChecked, setSessionChecked] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Si ya hay sesión de mesero/cocina/caja, salta directo a /waiter/control.
  // Si la sesión es de admin, NO redirigimos: el admin pudo haber llegado acá
  // queriendo loguearse como mesero. La sesión actual queda viva hasta que
  // efectivamente complete el login de mesero (ahí signIn la reemplaza).
  useEffect(() => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl) {
      const canonicalLoginUrl = new URL("/waiter/login", appUrl)
      if (window.location.origin !== canonicalLoginUrl.origin) {
        window.location.replace(canonicalLoginUrl.toString())
        return
      }
    }

    async function checkSession() {
      const claims = await getSessionClaims(supabase)
      if (claims) {
        const { data: mustChange } = await supabase.rpc("get_my_must_change_password")
        if (mustChange === true) {
          setView("change-password")
        } else {
          const { data: profile } = await supabase
            .from("users")
            .select("role_id")
            .eq("auth_user_id", claims.userId)
            .single()
          const role = roleIdToRole(profile?.role_id ?? 1)
          if (!isAdminRole(role)) {
            router.replace(getHomeRouteForRole(role))
            return
          }
        }
      }
      setSessionChecked(true)
    }
    checkSession()
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return

    try {
      setLoading(true)
      setError("")

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        if (signInError.message?.toLowerCase().includes("invalid login")) {
          setError("Correo o contraseña incorrectos")
        } else {
          setError(signInError.message)
        }
        return
      }

      const user = data.user
      if (!user) {
        setError("No se pudo iniciar sesión")
        return
      }

      // Limpia cache de la sesión anterior antes de leer el perfil nuevo.
      clearUserScopedCache()

      // Rechazar credenciales de admin/manager en este portal. Reintentamos la
      // lectura del perfil porque hay race conocida entre signInWithPassword
      // y la propagación del JWT a PostgREST.
      const profileRoleId = await fetchProfileRoleIdWithRetry(user.id)
      if (profileRoleId == null) {
        setError("No se pudo verificar tu cuenta. Reintenta en unos segundos.")
        return
      }
      const role = roleIdToRole(profileRoleId)
      if (isAdminRole(role)) {
        await supabase.auth.signOut()
        clearUserScopedCache()
        setError("Esta cuenta es de administrador. Ingresa en el portal de admin.")
        return
      }

      const { data: mustChange } = await supabase.rpc("get_my_must_change_password")
      if (mustChange === true) {
        setView("change-password")
        setPassword("") // limpiamos para que no aparezca prellenado
        return
      }

      router.replace(getHomeRouteForRole(role))
    } catch (err) {
      if (isNetworkError(err)) {
        setError("Sin conexión. Verifica tu internet.")
        return
      }
      logger.error("Error en login de mesero", err)
      setError("Error al iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return

    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      return
    }

    try {
      setLoading(true)
      setError("")

      // El cambio + limpieza del flag ocurre server-side (service_role); el
      // cliente no puede limpiar must_change_password por su cuenta.
      const { data, error: fnError } = await supabase.functions.invoke("change-my-password", {
        body: { newPassword },
      })

      if (fnError || !data?.ok) {
        setError(data?.error ?? "No se pudo cambiar la contraseña")
        return
      }

      router.replace("/waiter/control")
    } catch (err) {
      if (isNetworkError(err)) {
        setError("Sin conexión")
        return
      }
      logger.error("Error cambiando password de mesero", err)
      setError("Error al cambiar la contraseña")
    } finally {
      setLoading(false)
    }
  }

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 text-sm font-semibold text-stone-600">
        Cargando...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center">
        <section className="grid w-full gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
          {/* Panel izquierdo: marca */}
          <div className="flex flex-col justify-between rounded-[2rem] bg-stone-950 p-6 text-white shadow-2xl shadow-stone-900/15 sm:p-8">
            <div>
              <Link href="/" className="inline-flex items-center gap-3" aria-label="MESA inicio">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-sm font-bold text-white shadow-lg shadow-orange-500/25">
                  M
                </span>
                <span className="text-lg font-semibold tracking-tight">MESA</span>
              </Link>

              <div className="mt-10 max-w-md">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-300">
                  Portal meseros
                </p>
                <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
                  {view === "login" ? "Vuelve a atender tus mesas." : "Define tu contraseña."}
                </h1>
                <p className="mt-5 text-sm leading-6 text-stone-300 sm:text-base">
                  {view === "login"
                    ? "Toma pedidos, cobra mesas y revisa tu turno desde una experiencia clara para el día a día."
                    : "Es tu primer ingreso. Reemplaza la contraseña temporal por una propia antes de entrar."}
                </p>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <p className="text-xl font-bold tabular-nums">24</p>
                <p className="mt-1 text-stone-300">Pedidos</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <p className="text-xl font-bold tabular-nums">12</p>
                <p className="mt-1 text-stone-300">Mesas</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <p className="text-xl font-bold tabular-nums">8</p>
                <p className="mt-1 text-stone-300">Propinas</p>
              </div>
            </div>
          </div>

          {/* Panel derecho: formulario */}
          <div className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-8">
            <div className="mb-8">
              <p className="text-sm text-stone-600">
                {view === "login" ? "Bienvenido de vuelta" : "Primer ingreso"}
              </p>
              <h2 className="mt-1 text-3xl font-bold tracking-tight">
                {view === "login" ? "Iniciar sesión" : "Define tu contraseña"}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">
                {view === "login"
                  ? "Ingresa con el correo y contraseña que te compartió tu administrador."
                  : "Reemplaza la contraseña temporal por una propia."}
              </p>
            </div>

            {view === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label htmlFor="waiter-email" className="mb-2 block text-sm font-semibold text-stone-700">
                    Correo
                  </label>
                  <input
                    id="waiter-email"
                    type="email"
                    required
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tucorreo@restaurante.com"
                    className={INPUT_CLASS}
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor="waiter-password" className="block text-sm font-semibold text-stone-700">
                      Contraseña
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-semibold text-orange-600 transition hover:text-orange-700"
                    >
                      ¿La olvidaste?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      id="waiter-password"
                      type={showPassword ? "text" : "password"}
                      required
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`${INPUT_CLASS} pr-11`}
                    />
                    <EyeToggle shown={showPassword} onClick={() => setShowPassword((v) => !v)} />
                  </div>
                </div>

                {error && (
                  <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 hover:shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Ingresando..." : "Ingresar"}
                </button>

                <InstallPwaButton />
              </form>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-5">
                <div>
                  <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-stone-700">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      required
                      minLength={8}
                      disabled={loading}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`${INPUT_CLASS} pr-11`}
                    />
                    <EyeToggle shown={showNewPassword} onClick={() => setShowNewPassword((v) => !v)} />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-stone-700">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      minLength={8}
                      disabled={loading}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`${INPUT_CLASS} pr-11`}
                    />
                    <EyeToggle shown={showConfirmPassword} onClick={() => setShowConfirmPassword((v) => !v)} />
                  </div>
                </div>

                {error && (
                  <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 hover:shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Guardando..." : "Guardar y entrar"}
                </button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-stone-600">
              ¿No tienes cuenta? Contacta a tu administrador para que te dé acceso.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
