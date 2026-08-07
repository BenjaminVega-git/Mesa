import "server-only"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getSessionClaims } from "@/lib/supabase/claims"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { sendWaiterCredentialsEmail } from "@/lib/email/send-waiter-credentials"
import {
  CreateWaiterSchema,
  type CreateWaiterInput,
} from "@/lib/validation/waiter"
import { ok, fail, type Result } from "@/services/result"

// ============ TYPES ============

export type CreatedWaiter = {
  name: string
  email: string
  password: string
  emailSent: boolean
}

export type WaiterListItem = {
  id: number
  name: string
  email: string | null
  roleId: number
}

// ============ HELPERS ============

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : undefined) ??
    "https://tumesaqr.com"
  )
}

// ============ CREATE (admin) ============

export async function createWaiter(input: CreateWaiterInput): Promise<Result<CreatedWaiter>> {
  const validation = CreateWaiterSchema.safeParse(input)
  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { name, email, restaurantId, role } = validation.data
  if (!email) {
    return fail("El correo es obligatorio para crear un mesero")
  }

  // Verificar que el caller es admin del mismo restaurant
  const serverClient = await createSupabaseServerClient()
  const currentUser = await getSessionClaims(serverClient)

  if (!currentUser) return fail("No autorizado")

  const { data: adminProfile, error: profileError } = await serverClient
    .from("users")
    .select("restaurant_id, role_id")
    .eq("auth_user_id", currentUser.userId)
    .single()

  if (profileError || !adminProfile) return fail("Perfil no encontrado")
  if (adminProfile.role_id !== 2) return fail("Acceso restringido")
  if (adminProfile.restaurant_id !== restaurantId) {
    return fail("No tienes permiso sobre este restaurante")
  }

  // El alta del usuario va por la edge function provision-waiter (service_role):
  // no depende del signup público (desactivado) y valida que el caller sea admin
  // del restaurante. El trigger lo crea como mesero pendiente; assign_waiter lo
  // liga después. Devuelve la contraseña temporal generada.
  const { data: provisioned, error: provisionError } = await serverClient.functions.invoke(
    "provision-waiter",
    { body: { email, name, restaurantId } }
  )
  if (provisionError || !provisioned?.ok) {
    let msg = "Error al crear el mesero"
    if (provisioned?.error) {
      msg = provisioned.error as string
    } else if (provisionError) {
      const ctx = (provisionError as { context?: Response }).context
      if (ctx && typeof ctx.json === "function") {
        try {
          const b = await ctx.json()
          if (b?.error) msg = b.error
        } catch {
          // sin cuerpo legible: se mantiene el mensaje genérico
        }
      }
    }
    return fail(msg)
  }
  const password = provisioned.password as string

  // ===== BLOQUE NUEVO: ligar el mesero al restaurante vía RPC validada =====
  // El trigger creó al usuario como "mesero pendiente" (role 1, sin
  // restaurante). Como admin ya validado, lo asignamos a nuestro restaurante.
  const { data: assignedUserId, error: assignError } = await serverClient.rpc("assign_waiter", {
    p_waiter_email: email,
    p_restaurant_id: restaurantId,
  })

  if (assignError) {
    return fail(assignError.message ?? "Error al asignar el mesero al restaurante")
  }
  // ===== FIN BLOQUE NUEVO =====

  // Si el rol elegido no es mesero, ajustamos users.role_id vía RPC admin.
  // assign_waiter devolvió el id (bigint) del usuario recién ligado.
  if (role !== "waiter" && assignedUserId != null) {
    const { error: roleError } = await serverClient.rpc("admin_set_staff_role", {
      p_user_id: assignedUserId,
      p_role_id: role === "kitchen" ? 3 : 4,
    })

    if (roleError) {
      return fail(roleError.message ?? "Error al asignar el rol al personal")
    }
  }

 

  // Best-effort: enviar email con credenciales
  const loginUrl = `${getAppBaseUrl()}/waiter/login`
  const { sent } = await sendWaiterCredentialsEmail({
    to: email,
    name,
    email,
    password,
    loginUrl,
  })

  return ok({ name, email, password, emailSent: sent })
}

// ============ LIST (admin) ============

export async function listWaiters(): Promise<Result<WaiterListItem[]>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("list_waiters_for_admin")

  if (error) return fail(error.message)

  type Row = {
    id: number
    user_name: string
    user_email: string | null
    role_id: number
  }

  return ok(
    ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      name: row.user_name,
      email: row.user_email,
      roleId: row.role_id,
    }))
  )
}

// ============ DELETE (admin) ============

export async function deleteWaiter(waiterId: number): Promise<Result<{ id: number }>> {
  if (!waiterId || waiterId <= 0) return fail("ID inválido")

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { error } = await supabase.rpc("delete_waiter_as_admin", {
    p_waiter_id: waiterId,
  })

  if (error) return fail(error.message)

  return ok({ id: waiterId })
}
