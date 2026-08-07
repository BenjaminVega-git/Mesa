import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { logger } from "@/lib/logger"
import { isNetworkError } from "@/hooks/useOfflineRetry"
import { isAdminRole, roleIdToRole } from "@/lib/waiter-session"
import { clearUserScopedCache } from "@/lib/session-cache"

export function useLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function login(e: React.FormEvent) {
    e.preventDefault()

    const form = e.currentTarget as HTMLFormElement
    const formData = new FormData(form)
    const submittedEmail = String(formData.get("email") ?? email).trim()
    const submittedPassword = String(formData.get("password") ?? password)

    if (!submittedEmail || !submittedPassword) {
      setError("Introduce tu correo y contraseña.")
      return
    }

    try {
      setLoading(true)
      setError("")

      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: submittedEmail, password: submittedPassword }),
        "La autenticación tardó demasiado. Revisa la conexión con Supabase local.",
      )

      if (error) throw error
      if (!data.user) {
        setError("No se pudo iniciar sesión")
        return
      }

      // Limpiamos cualquier cache de la sesión anterior ANTES de leer el perfil
      // así no quedan rastros de otro restaurante en memoria/localStorage.
      clearUserScopedCache()

      // Race conocida en supabase-js: la query siguiente a veces dispara antes
      // de que PostgREST registre el JWT nuevo. Si fetchProfile devuelve null
      // por culpa de eso, reintentamos hasta 3 veces con backoff corto antes
      // de rendirnos. Nunca hacemos signOut automático: si el perfil no se
      // puede leer, mostramos error y dejamos al usuario decidir.
      const profileRoleId = await withTimeout(
        fetchProfileRoleIdWithRetry(data.user.id),
        "La sesión se creó, pero no se pudo verificar el perfil local.",
      )
      if (profileRoleId == null) {
        setError("No se pudo verificar tu cuenta. Reintentá en unos segundos.")
        return
      }

      const role = roleIdToRole(profileRoleId)
      if (!isAdminRole(role)) {
        await supabase.auth.signOut()
        clearUserScopedCache()
        setError("Esta cuenta no es de administrador. Ingresa en el portal de mesero.")
        return
      }

      // Primer ingreso con contraseña temporal: forzar el cambio antes de entrar.
      const { data: mustChange } = await supabase.rpc("get_my_must_change_password")
      if (mustChange === true) {
        router.push("/cambiar-contrasena")
        return
      }

      router.push("/admin")
    } catch (err: unknown) {
      logger.error("Error en login", err)
      setError(
        isNetworkError(err)
          ? "Sin conexión. Revisa tu internet e intenta de nuevo."
          : "No se pudo iniciar sesión"
      )
    } finally {
      setLoading(false)
    }
  }

  return { email, setEmail, password, setPassword, loading, error, login }
}

async function fetchProfileRoleIdWithRetry(authUserId: string): Promise<number | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("users")
      .select("role_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle()

    if (!error && data?.role_id != null) return data.role_id

    const { data: roleId } = await supabase.rpc("get_my_role_id")
    if (roleId != null) return Number(roleId)

    // Espera corta para dar tiempo a que PostgREST vea el JWT nuevo.
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
  }
  return null
}

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 10000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
