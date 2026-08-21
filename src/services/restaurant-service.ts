"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { z } from "zod"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { ok, fail, type Result } from "@/services/result"
import { TEMPLATE_IDS } from "@/lib/menu/templates"

const UpdateMenuTemplateSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
})

export type UpdateMenuTemplateInput = z.infer<typeof UpdateMenuTemplateSchema>

export async function updateMenuTemplate(
  input: UpdateMenuTemplateInput
): Promise<Result<null>> {
  const parsed = UpdateMenuTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data

  const { error } = await supabase
    .from("restaurants")
    .update({ menu_template: parsed.data.template })
    .eq("id", restaurantId)

  if (error) return fail("No se pudo guardar los cambios")

  revalidateTag("menu", "max")
  revalidatePath("/[id]/menu", "page")
  return ok(null)
}

const UpdateOrderDestinationSchema = z.object({
  destination: z.enum(["waiter", "kitchen"]),
})

export type UpdateOrderDestinationInput = z.infer<typeof UpdateOrderDestinationSchema>

export async function updateOrderDestination(
  input: UpdateOrderDestinationInput
): Promise<Result<null>> {
  const parsed = UpdateOrderDestinationSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data

  const { error } = await supabase
    .from("restaurants")
    .update({ order_destination: parsed.data.destination })
    .eq("id", restaurantId)

  if (error) return fail("No se pudo guardar los cambios")

  return ok(null)
}

const UpdateStockMenuModeSchema = z.object({
  mode: z.enum(["block", "info"]),
})

export type UpdateStockMenuModeInput = z.infer<typeof UpdateStockMenuModeSchema>

export async function updateStockMenuMode(
  input: UpdateStockMenuModeInput
): Promise<Result<null>> {
  const parsed = UpdateStockMenuModeSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase } = auth.data

  // RPC: actualiza el modo Y recalcula la disponibilidad de todos los productos
  // (para que el menú refleje el cambio al instante).
  const { error } = await supabase.rpc("set_stock_menu_mode", { p_mode: parsed.data.mode })

  if (error) return fail("No se pudo guardar los cambios")

  revalidateTag("menu", "max")
  revalidatePath("/[id]/menu", "page")
  return ok(null)
}

const UpdateOutputModeSchema = z.object({
  mode: z.enum(["none", "printer", "screen"]),
  bluetoothName: z
    .string()
    .trim()
    .max(80, "Máximo 80 caracteres")
    .optional()
    .nullable(),
})

export type UpdateOutputModeInput = z.infer<typeof UpdateOutputModeSchema>

export async function updateOutputMode(
  input: UpdateOutputModeInput
): Promise<Result<null>> {
  const parsed = UpdateOutputModeSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data
  const { mode, bluetoothName } = parsed.data

  const { error } = await supabase
    .from("restaurants")
    .update({
      output_mode: mode,
      printer_bluetooth_name: mode === "printer" ? (bluetoothName?.trim() || null) : null,
    })
    .eq("id", restaurantId)

  if (error) return fail("No se pudo guardar los cambios")

  return ok(null)
}

const WhatsappNumberSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\+?[0-9]{8,15}$/, "Número de WhatsApp inválido (usá formato internacional, ej. +56912345678)")
  )

const UpdateReservationConfigSchema = z
  .object({
    contactType: z.enum(["none", "whatsapp"]),
    whatsapp: z.string().trim().optional().nullable(),
    durationMinutes: z
      .number()
      .int()
      .min(15, "La duración mínima es 15 minutos")
      .max(720, "La duración máxima es 720 minutos"),
  })
  .refine(
    (data) =>
      data.contactType !== "whatsapp" ||
      WhatsappNumberSchema.safeParse(data.whatsapp ?? "").success,
    {
      path: ["whatsapp"],
      message: "Número de WhatsApp inválido (usá formato internacional, ej. +56912345678)",
    }
  )

export type UpdateReservationConfigInput = z.infer<typeof UpdateReservationConfigSchema>

export async function updateReservationConfig(
  input: UpdateReservationConfigInput
): Promise<Result<null>> {
  const parsed = UpdateReservationConfigSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data
  const { contactType, whatsapp, durationMinutes } = parsed.data

  const normalizedWhatsapp =
    contactType === "whatsapp"
      ? WhatsappNumberSchema.parse(whatsapp ?? "")
      : null

  const { error } = await supabase
    .from("restaurants")
    .update({
      reservation_contact_type: contactType,
      reservation_whatsapp: normalizedWhatsapp,
      reservation_duration_minutes: durationMinutes,
    })
    .eq("id", restaurantId)

  if (error) return fail("No se pudo guardar los cambios")

  return ok(null)
}

const UpdateRestaurantNameSchema = z.object({
  name: z.string().trim().min(1, "El nombre no puede estar vacío").max(60, "Máximo 60 caracteres"),
})

const RESERVED_SLUGS = new Set([
  "admin", "api", "forgot-password", "login", "r", "register",
  "reset-password", "restaurant", "screen", "sumate", "waiter",
  "monitoring", "icons", "public", "static", "_next",
])

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

const UpdateDeliveryConfigSchema = z.object({
  enabled: z.boolean(),
  homeDelivery: z.boolean(),
  pickup: z.boolean(),
  onlinePayment: z.boolean(),
  payAtStore: z.boolean(),
  deliveryFee: z.number().int("El costo debe ser un monto entero").min(0, "El costo no puede ser negativo").max(10_000_000, "El costo es demasiado alto").nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "El identificador debe tener al menos 3 caracteres")
    .max(60, "Máximo 60 caracteres")
    .regex(SLUG_REGEX, "Solo letras minúsculas, números y guiones (sin espacios ni acentos)")
    .refine((s) => !RESERVED_SLUGS.has(s), {
      message: "Ese identificador está reservado, probá con otro",
    })
    .nullable()
    .optional(),
})

export type UpdateDeliveryConfigInput = z.infer<typeof UpdateDeliveryConfigSchema>

export async function updateDeliveryConfig(
  input: UpdateDeliveryConfigInput
): Promise<Result<null>> {
  const parsed = UpdateDeliveryConfigSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { enabled, slug, homeDelivery, pickup, onlinePayment, payAtStore, deliveryFee } = parsed.data

  if (enabled && !slug) {
    return fail("Necesitás definir un identificador para activar delivery")
  }
  if (enabled && !homeDelivery && !pickup) {
    return fail("Activa entrega a domicilio, retiro en tienda o ambas opciones")
  }
  if (enabled && !onlinePayment && !payAtStore) {
    return fail("Activa pago anticipado, pago en el local o ambas opciones")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data

  const { error } = await supabase
    .from("restaurants")
    .update({
      delivery_enabled: enabled,
      delivery_slug: slug ?? null,
      delivery_home_enabled: homeDelivery,
      pickup_enabled: pickup,
      delivery_online_payment_enabled: onlinePayment,
      delivery_pay_at_store_enabled: payAtStore,
      delivery_fee: homeDelivery && deliveryFee && deliveryFee > 0 ? deliveryFee : null,
    })
    .eq("id", restaurantId)

  if (error) {
    if (error.code === "23505") {
      return fail("Ese identificador ya está en uso por otro local")
    }
    return fail("No se pudo guardar los cambios")
  }

  return ok(null)
}

const UpdateLocationConfigSchema = z
  .object({
    enabled: z.boolean(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    // Browsers may report a very imprecise fallback location (for example,
    // from a cell tower). Keep accepting that reading so the UI can explain
    // it and require an explicit confirmation before saving it.
    accuracyM: z.number().finite().min(0).max(100000).nullable(),
    radiusM: z.number().int().min(30).max(1000),
  })
  .refine((data) => !data.enabled || (data.latitude != null && data.longitude != null), {
    message: "Activa el GPS y registra la ubicación del local",
  })

export type UpdateLocationConfigInput = z.infer<typeof UpdateLocationConfigSchema>

export async function updateLocationConfig(
  input: UpdateLocationConfigInput
): Promise<Result<null>> {
  const parsed = UpdateLocationConfigSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data
  const { enabled, latitude, longitude, accuracyM, radiusM } = parsed.data

  const { data, error } = await supabase
    .from("restaurants")
    .update({
      location_check_enabled: enabled,
      location_latitude: enabled ? latitude : null,
      location_longitude: enabled ? longitude : null,
      location_accuracy_m: enabled ? accuracyM : null,
      location_radius_m: radiusM,
    })
    .eq("id", restaurantId)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("updateLocationConfig failed", {
      code: error.code,
      message: error.message,
      details: error.details,
    })

    if (error.code === "PGRST204" || error.message.includes("schema cache")) {
      return fail("No se pudo guardar la ubicación: falta aplicar la migración de ubicación en esta base")
    }
    if (error.code === "42501") {
      return fail("No se pudo guardar la ubicación: el usuario no tiene permiso para actualizar este local")
    }
    if (error.code === "23514") {
      return fail("No se pudo guardar la ubicación: revisa que el radio esté entre 30 y 1000 metros")
    }

    return fail("No se pudo guardar la ubicación")
  }

  if (!data) {
    return fail("No se pudo guardar la ubicación: no se encontró el local de este usuario")
  }

  revalidateTag("menu", "max")
  revalidatePath("/[id]/menu", "page")
  return ok(null)
}

const UpdateRestaurantCitySchema = z.object({
  city: z.string().trim().max(80, "Máximo 80 caracteres").nullable(),
})

export type UpdateRestaurantCityInput = z.infer<typeof UpdateRestaurantCitySchema>

export async function updateRestaurantCity(
  input: UpdateRestaurantCityInput
): Promise<Result<null>> {
  const parsed = UpdateRestaurantCitySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data

  const { error } = await supabase
    .from("restaurants")
    .update({ restaurant_city: parsed.data.city?.trim() || null })
    .eq("id", restaurantId)

  if (error) return fail("No se pudo guardar los cambios")

  return ok(null)
}

const LogoUrlSchema = z
  .string()
  .trim()
  .url("URL de logo inválida")
  .max(500, "URL demasiado larga")
  .nullable()

const CompleteOnboardingSchema = z.object({
  restaurantName: z.string().trim().min(1, "El nombre del restaurante no puede estar vacío").max(60, "Máximo 60 caracteres"),
  adminName: z.string().trim().min(1, "Tu nombre no puede estar vacío").max(60, "Máximo 60 caracteres"),
  restaurantLogo: LogoUrlSchema.optional(),
})

export type CompleteOnboardingInput = z.infer<typeof CompleteOnboardingSchema>

export async function completeOnboarding(
  input: CompleteOnboardingInput
): Promise<Result<null>> {
  const parsed = CompleteOnboardingSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data

  const restaurantUpdate: { restaurant_name: string; restaurant_logo?: string | null } = {
    restaurant_name: parsed.data.restaurantName,
  }
  if (parsed.data.restaurantLogo !== undefined) {
    restaurantUpdate.restaurant_logo = parsed.data.restaurantLogo
  }

  const [restaurantRes, userRes] = await Promise.all([
    supabase
      .from("restaurants")
      .update(restaurantUpdate)
      .eq("id", restaurantId),
    supabase.rpc("update_own_user_name", { p_user_name: parsed.data.adminName }),
  ])

  if (restaurantRes.error || userRes.error) {
    return fail("No se pudo completar la configuración inicial")
  }

  revalidateTag("menu", "max")
  revalidatePath("/[id]/menu", "page")
  return ok(null)
}

const UpdateRestaurantLogoSchema = z.object({
  logo: LogoUrlSchema,
})

export type UpdateRestaurantLogoInput = z.infer<typeof UpdateRestaurantLogoSchema>

export async function updateRestaurantLogo(
  input: UpdateRestaurantLogoInput
): Promise<Result<null>> {
  const parsed = UpdateRestaurantLogoSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data

  const { error } = await supabase
    .from("restaurants")
    .update({ restaurant_logo: parsed.data.logo })
    .eq("id", restaurantId)

  if (error) return fail("No se pudo guardar el logo")

  revalidateTag("menu", "max")
  revalidatePath("/[id]/menu", "page")
  return ok(null)
}

export type UpdateRestaurantNameInput = z.infer<typeof UpdateRestaurantNameSchema>

export async function updateRestaurantName(
  input: UpdateRestaurantNameInput
): Promise<Result<null>> {
  const parsed = UpdateRestaurantNameSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const auth = await requireCurrentAdmin()
  if (!auth.ok) return auth

  const { supabase, restaurantId } = auth.data

  const { error } = await supabase
    .from("restaurants")
    .update({ restaurant_name: parsed.data.name })
    .eq("id", restaurantId)

  if (error) return fail("No se pudo guardar los cambios")

  revalidateTag("menu", "max")
  revalidatePath("/[id]/menu", "page")
  return ok(null)
}
