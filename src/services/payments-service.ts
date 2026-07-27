"use server"

import { z } from "zod"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { ok, fail, type Result } from "@/services/result"

export type TaxProfile = {
  rut: string
  razonSocial: string
  giro: string
  direccion: string
  comuna: string
  actividadEconomica: string
  regimenIva: string
  logoUrl: string
}

export type PaymentAccount = {
  provider: string | null
  providerAccountId: string | null
  status: string
  /** Pausada (sin borrar credenciales) — independiente de status. */
  active: boolean
  hasCredentials: boolean
  connectedAt: string | null
}

const TaxProfileSchema = z.object({
  rut: z.string().trim().max(20, "Máximo 20 caracteres"),
  razonSocial: z.string().trim().max(120, "Máximo 120 caracteres"),
  giro: z.string().trim().max(200, "Máximo 200 caracteres"),
  direccion: z.string().trim().max(160, "Máximo 160 caracteres"),
  comuna: z.string().trim().max(80, "Máximo 80 caracteres"),
  actividadEconomica: z.string().trim().max(200, "Máximo 200 caracteres"),
  regimenIva: z.string().trim().max(40, "Máximo 40 caracteres"),
  logoUrl: z.string().trim().max(500, "URL demasiado larga"),
})

export type SaveTaxProfileInput = z.infer<typeof TaxProfileSchema>

type TaxProfileRow = {
  rut?: string | null
  razon_social?: string | null
  giro?: string | null
  direccion?: string | null
  comuna?: string | null
  actividad_economica?: string | null
  regimen_iva?: string | null
  logo_url?: string | null
}

function str(v: string | null | undefined): string {
  return v == null ? "" : String(v)
}

export async function getTaxProfile(): Promise<Result<TaxProfile>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("get_my_tax_profile")

  if (error) return fail("Error al cargar los datos tributarios")

  const raw = (data ?? {}) as TaxProfileRow

  return ok({
    rut: str(raw.rut),
    razonSocial: str(raw.razon_social),
    giro: str(raw.giro),
    direccion: str(raw.direccion),
    comuna: str(raw.comuna),
    actividadEconomica: str(raw.actividad_economica),
    regimenIva: str(raw.regimen_iva),
    logoUrl: str(raw.logo_url),
  })
}

export async function saveTaxProfile(
  input: SaveTaxProfileInput
): Promise<Result<null>> {
  const parsed = TaxProfileSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { error } = await supabase.rpc("upsert_my_tax_profile", {
    p_rut: parsed.data.rut,
    p_razon: parsed.data.razonSocial,
    p_giro: parsed.data.giro,
    p_direccion: parsed.data.direccion,
    p_comuna: parsed.data.comuna,
    p_actividad: parsed.data.actividadEconomica,
    p_regimen: parsed.data.regimenIva,
    p_logo_url: parsed.data.logoUrl || null,
  })

  if (error) return fail("No se pudo guardar los datos tributarios")

  return ok(null)
}

type PaymentAccountRow = {
  provider?: string | null
  provider_account_id?: string | null
  status?: string | null
  active?: boolean | null
  has_credentials?: boolean | null
  connected_at?: string | null
}

export async function getPaymentAccount(): Promise<Result<PaymentAccount>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("get_my_payment_account")

  if (error) return fail("Error al cargar el estado de cobros")

  const raw = (data ?? {}) as PaymentAccountRow

  return ok({
    provider: raw.provider ?? null,
    providerAccountId: raw.provider_account_id ?? null,
    status: raw.status ?? "disconnected",
    active: raw.active ?? true,
    hasCredentials: raw.has_credentials ?? false,
    connectedAt: raw.connected_at ?? null,
  })
}

/**
 * Conecta la pasarela de pago del restaurante. Las credenciales se pasan como
 * JSON (según el proveedor) y se guardan CIFRADAS en Vault (nunca se devuelven).
 */
export async function connectPaymentAccount(input: {
  provider: string
  accountId: string
  credentials: string
}): Promise<Result<null>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  if (!input.provider) return fail("Elige un proveedor")
  if (input.credentials.length > 20_000) return fail("Credenciales demasiado grandes")

  const { error } = await supabase.rpc("payment_connect_account", {
    p_provider: input.provider,
    p_account_id: input.accountId || null,
    p_credentials: input.credentials || null,
  })
  if (error) return fail("No se pudo conectar la cuenta de cobro")
  return ok(null)
}

export async function disconnectPaymentAccount(): Promise<Result<null>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data
  const { error } = await supabase.rpc("payment_disconnect_account")
  if (error) return fail("No se pudo desconectar la cuenta")
  return ok(null)
}

/**
 * Pausa o reactiva la pasarela SIN borrar las credenciales guardadas (a
 * diferencia de disconnectPaymentAccount). Pausada: el comensal deja de ver
 * "Pagar en línea" y el staff deja de ver el QR de pago al cobrar.
 */
export async function setPaymentAccountActive(active: boolean): Promise<Result<null>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data
  const { error } = await supabase.rpc("payment_set_active", { p_active: active })
  if (error) return fail(error.message ?? "No se pudo actualizar la pasarela")
  return ok(null)
}
