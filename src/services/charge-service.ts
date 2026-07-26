"use server"

// COBRO desde el panel admin y la app del mesero.
//
//  · registerStaffPayment: cobro presencial (efectivo/tarjeta) vía la RPC
//    staff_register_payment y emisión AUTOMÁTICA de la boleta ligada al pago.
//    Si la boleta falla, el cobro NO se pierde: queda el botón "Emitir boleta"
//    en el panel de pagos del día.
//  · createStaffGatewayCharge: genera el link de pago en la pasarela conectada
//    (edge function payment-staff-charge, autenticada con el JWT del staff).
//    La UI lo muestra como QR; la confirmación llega por webhook/retorno y la
//    UI la observa con getStaffPayment (polling).
//  · emitBoletaForPayment: emite (o reintenta) la boleta de un pago pagado.
//  · listPaymentsToday / getStaffPayment / getPaymentReceipt: lecturas staff.

import { requireCurrentStaff } from "@/services/auth-guard"
import { getDteAdapter } from "@/lib/dte"
import { logger } from "@/lib/logger"
import { ok, fail, type Result } from "@/services/result"
import type { SupabaseClient } from "@supabase/supabase-js"

export type BoletaInfo = { id: number; folio: number | null; siiStatus: string }

export type StaffChargeResult = {
  paymentId: number
  amount: number
  tip: number
  tableReleased: boolean
  boleta: BoletaInfo | null
  /** La boleta falló pero el cobro quedó registrado (se puede reintentar). */
  boletaError: string | null
}

export type ChargeScope = {
  tableId: number
  tip?: number
  dinerSlot?: number | null
  orderId?: number | null
  /** Dividir cuenta: cobra exactamente este conjunto de pedidos de la mesa
   *  (en vez de la mesa completa, un comensal o un pedido puntual). */
  orderIds?: number[] | null
}

/** Emite la boleta de un pago y la registra ligada a él (helper interno). */
async function emitBoletaInternal(
  supabase: SupabaseClient,
  paymentId: number,
  total: number
): Promise<Result<BoletaInfo>> {
  // Documento afecto: IVA (19%) desglosado desde el total. La propina no es
  // venta afecta: la boleta va por el monto de la cuenta, sin propina.
  const net = Math.round(total / 1.19)
  const iva = total - net

  const { data: prof } = await supabase.rpc("get_my_tax_profile")
  const emisor = {
    rut: (prof?.rut as string) ?? "",
    razonSocial: (prof?.razon_social as string) ?? "",
  }

  const adapter = getDteAdapter()
  let res
  try {
    res = await adapter.emit({ type: "boleta", net, iva, total, emisor })
  } catch (err) {
    logger.error("Fallo al emitir la boleta del cobro", err)
    return fail("No se pudo emitir la boleta")
  }

  const { data: docId, error } = await supabase.rpc("dte_record_document", {
    p_doc_type: 39,
    p_net: net,
    p_iva: iva,
    p_total: total,
    p_receptor_rut: null,
    p_receptor_razon: null,
    p_receptor_giro: null,
    p_receptor_dir: null,
    p_sii_status: res.status,
    p_folio: res.folio ?? null,
    p_track_id: res.trackId ?? null,
    p_pdf_url: res.pdfUrl ?? null,
    p_xml_url: res.xmlUrl ?? null,
    p_payment_id: paymentId,
  })
  if (error) {
    logger.error("Boleta emitida pero no registrada", error)
    return fail("La boleta se emitió pero no se pudo registrar")
  }

  return ok({ id: docId as number, folio: res.folio ?? null, siiStatus: res.status })
}

/** Cobro presencial (efectivo o tarjeta) + boleta automática. */
export async function registerStaffPayment(
  scope: ChargeScope,
  method: "cash" | "card"
): Promise<Result<StaffChargeResult>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("staff_register_payment", {
    p_table_id: scope.tableId,
    p_method: method,
    p_tip: Math.max(0, Math.round(scope.tip ?? 0)),
    p_diner_slot: scope.dinerSlot ?? null,
    p_order_id: scope.orderId ?? null,
    p_order_ids: scope.orderIds ?? null,
  })
  if (error) return fail(error.message ?? "No se pudo registrar el cobro")

  const paymentId = Number(data?.payment_id)
  const amount = Number(data?.amount ?? 0)
  const tip = Number(data?.tip ?? 0)
  const tableReleased = Boolean(data?.table_released)

  const boleta = await emitBoletaInternal(supabase, paymentId, amount)

  return ok({
    paymentId,
    amount,
    tip,
    tableReleased,
    boleta: boleta.ok ? boleta.data : null,
    boletaError: boleta.ok ? null : boleta.error,
  })
}

/** Reintentar (o emitir tarde) la boleta de un pago ya pagado. */
export async function emitBoletaForPayment(paymentId: number): Promise<Result<BoletaInfo>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data: pay, error } = await supabase.rpc("get_my_payment", { p_payment_id: paymentId })
  if (error || !pay) return fail("Pago no encontrado")
  if (pay.status !== "paid") return fail("El pago todavía no está pagado")
  if (pay.boleta) {
    return ok({
      id: Number(pay.boleta.id),
      folio: pay.boleta.folio != null ? Number(pay.boleta.folio) : null,
      siiStatus: String(pay.boleta.sii_status ?? "pending"),
    })
  }

  return emitBoletaInternal(supabase, paymentId, Number(pay.amount ?? 0))
}

export type GatewayCharge = { paymentId: number; checkoutUrl: string }

/** Genera el cobro en la pasarela conectada y devuelve el link/QR de pago. */
export async function createStaffGatewayCharge(
  scope: ChargeScope,
  payerEmail?: string
): Promise<Result<GatewayCharge>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return fail("Sesión expirada")

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  let res: Response
  try {
    res = await fetch(`${base}/functions/v1/payment-staff-charge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tableId: scope.tableId,
        tip: Math.max(0, Math.round(scope.tip ?? 0)),
        dinerSlot: scope.dinerSlot ?? undefined,
        payerEmail: payerEmail?.trim() || undefined,
      }),
      cache: "no-store",
    })
  } catch {
    return fail("No se pudo contactar la pasarela")
  }

  const body = (await res.json().catch(() => null)) as
    | { checkoutUrl?: string; paymentId?: number; error?: string }
    | null
  if (!res.ok || !body?.checkoutUrl || !body?.paymentId) {
    return fail(body?.error ?? "La pasarela rechazó el cobro")
  }

  return ok({ paymentId: body.paymentId, checkoutUrl: body.checkoutUrl })
}

export type StaffPayment = {
  id: number
  status: string
  method: string
  provider: string | null
  amount: number
  tip: number
  tableNumber: number | null
  paidAt: string | null
  boleta: BoletaInfo | null
}

function mapBoleta(b: { id: number; folio: number | null; sii_status: string } | null): BoletaInfo | null {
  if (!b) return null
  return {
    id: Number(b.id),
    folio: b.folio != null ? Number(b.folio) : null,
    siiStatus: String(b.sii_status ?? "pending"),
  }
}

/** Estado de un pago (polling del cobro por pasarela). */
export async function getStaffPayment(paymentId: number): Promise<Result<StaffPayment>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("get_my_payment", { p_payment_id: paymentId })
  if (error || !data) return fail("Pago no encontrado")

  return ok({
    id: Number(data.id),
    status: String(data.status),
    method: String(data.method),
    provider: data.provider ?? null,
    amount: Number(data.amount ?? 0),
    tip: Number(data.tip ?? 0),
    tableNumber: data.table_number != null ? Number(data.table_number) : null,
    paidAt: data.paid_at ?? null,
    boleta: mapBoleta(data.boleta ?? null),
  })
}

export type PaymentTodayRow = StaffPayment & { createdAt: string }

/** Todos los pagos de hoy del restaurante (efectivo, tarjeta y en línea). */
export async function listPaymentsToday(): Promise<Result<PaymentTodayRow[]>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("list_my_payments_today")
  if (error) return fail("No se pudieron cargar los pagos de hoy")

  type Row = {
    id: number
    table_number: number | null
    amount: number
    tip: number
    status: string
    method: string
    provider: string | null
    created_at: string
    paid_at: string | null
    boleta: { id: number; folio: number | null; sii_status: string } | null
  }
  const rows = (data ?? []) as Row[]
  return ok(
    rows.map((r) => ({
      id: Number(r.id),
      status: String(r.status),
      method: String(r.method),
      provider: r.provider ?? null,
      amount: Number(r.amount ?? 0),
      tip: Number(r.tip ?? 0),
      tableNumber: r.table_number != null ? Number(r.table_number) : null,
      createdAt: r.created_at,
      paidAt: r.paid_at ?? null,
      boleta: mapBoleta(r.boleta),
    }))
  )
}

/** Proveedor de pasarela conectado (o null) para ofrecer "cobrar con QR". */
export async function getGatewayProvider(): Promise<Result<string | null>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("staff_gateway_provider")
  if (error) return ok(null) // fail-closed: sin pasarela ofrecida
  return ok((data as string | null) ?? null)
}

export type PaymentReceipt = {
  doc: {
    id: number
    docType: number
    folio: number | null
    net: number | null
    iva: number | null
    total: number | null
    receptorRut: string | null
    receptorRazon: string | null
    receptorGiro: string | null
    receptorDir: string | null
    siiStatus: string
    trackId: string | null
    pdfUrl: string | null
    xmlUrl: string | null
    emittedAt: string | null
    createdAt: string
    simulated: boolean
  }
  emisor: {
    rut: string
    razonSocial: string
    giro: string
    direccion: string
    comuna: string
    actividadEconomica: string
    logoUrl: string | null
  }
}

/** Boleta imprimible de un pago (staff: la usa /boleta/[paymentId]). */
export async function getPaymentReceipt(paymentId: number): Promise<Result<PaymentReceipt>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("get_payment_receipt", { p_payment_id: paymentId })
  if (error || !data?.doc) return fail("El pago no tiene boleta")

  const d = data.doc as Record<string, unknown>
  const e = (data.emisor ?? {}) as Record<string, unknown>
  return ok({
    doc: {
      id: Number(d.id),
      docType: Number(d.doc_type),
      folio: d.folio != null ? Number(d.folio) : null,
      net: d.net != null ? Number(d.net) : null,
      iva: d.iva != null ? Number(d.iva) : null,
      total: d.total != null ? Number(d.total) : null,
      receptorRut: (d.receptor_rut as string) ?? null,
      receptorRazon: (d.receptor_razon as string) ?? null,
      receptorGiro: (d.receptor_giro as string) ?? null,
      receptorDir: (d.receptor_dir as string) ?? null,
      siiStatus: String(d.sii_status ?? "pending"),
      trackId: (d.track_id as string) ?? null,
      pdfUrl: (d.pdf_url as string) ?? null,
      xmlUrl: (d.xml_url as string) ?? null,
      emittedAt: (d.emitted_at as string) ?? null,
      createdAt: String(d.created_at ?? ""),
      simulated: String(d.track_id ?? "").startsWith("SIM-"),
    },
    emisor: {
      rut: (e.rut as string) ?? "",
      razonSocial: (e.razon_social as string) ?? "",
      giro: (e.giro as string) ?? "",
      direccion: (e.direccion as string) ?? "",
      comuna: (e.comuna as string) ?? "",
      actividadEconomica: (e.actividad_economica as string) ?? "",
      logoUrl: (e.logo_url as string) ?? null,
    },
  })
}
