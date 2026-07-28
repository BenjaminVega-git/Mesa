"use server"

import { requireCurrentAdmin } from "@/services/auth-guard"
import { getDteAdapter, isDteSimulated, DTE_SII_CODE, type DteType } from "@/lib/dte"
import { logger } from "@/lib/logger"
import { ok, fail, type Result } from "@/services/result"
import type { SupabaseClient } from "@supabase/supabase-js"

export type TaxDocumentItem = {
  name: string
  variantName: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

function mapItems(raw: unknown): TaxDocumentItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => {
    const row = r as Record<string, unknown>
    return {
      name: (row.name as string) || "Producto",
      variantName: (row.variant_name as string) ?? null,
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unit_price ?? 0),
      lineTotal: Number(row.line_total ?? 0),
    }
  })
}

export type TaxDocument = {
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
  voided: boolean
  voidedByDocId: number | null
  refDocType: number | null
  refFolio: number | null
  refCode: number | null
  refReason: string | null
}

type Row = {
  id: number
  doc_type: number
  folio: number | null
  net: number | null
  iva: number | null
  total: number | null
  receptor_rut: string | null
  receptor_razon: string | null
  receptor_giro: string | null
  receptor_dir: string | null
  sii_status: string
  track_id: string | null
  pdf_url: string | null
  xml_url: string | null
  emitted_at: string | null
  created_at: string
  voided: boolean
  voided_by_doc_id: number | null
  ref_doc_type: number | null
  ref_folio: number | null
  ref_code: number | null
  ref_reason: string | null
}

function mapRow(r: Row): TaxDocument {
  return {
    id: r.id,
    docType: r.doc_type,
    folio: r.folio,
    net: r.net,
    iva: r.iva,
    total: r.total,
    receptorRut: r.receptor_rut,
    receptorRazon: r.receptor_razon,
    receptorGiro: r.receptor_giro,
    receptorDir: r.receptor_dir,
    siiStatus: r.sii_status,
    trackId: r.track_id,
    pdfUrl: r.pdf_url,
    xmlUrl: r.xml_url,
    emittedAt: r.emitted_at,
    createdAt: r.created_at,
    simulated: (r.track_id ?? "").startsWith("SIM-"),
    voided: r.voided ?? false,
    voidedByDocId: r.voided_by_doc_id,
    refDocType: r.ref_doc_type,
    refFolio: r.ref_folio,
    refCode: r.ref_code,
    refReason: r.ref_reason,
  }
}

/**
 * Worker perezoso de estado SII: con proveedor REAL, re-consulta los
 * documentos que quedaron 'pending' (máx. 5 por carga, best-effort) antes de
 * listarlos. El SII no manda webhooks — este sondeo al abrir el panel es lo
 * que resuelve los "en trámite".
 */
async function refreshPendingDocs(supabase: SupabaseClient, rows: Row[]): Promise<boolean> {
  if (isDteSimulated()) return false
  const adapter = getDteAdapter()
  const pending = rows
    .filter((r) => r.sii_status === "pending" && r.track_id && !r.track_id.startsWith("SIM-"))
    .slice(0, 5)

  let changed = false
  for (const row of pending) {
    try {
      const res = await adapter.checkStatus(row.track_id as string)
      if (res.status === "accepted" || res.status === "rejected") {
        const { error } = await supabase.rpc("dte_update_status", {
          p_id: row.id,
          p_sii_status: res.status,
          p_folio: res.folio ?? null,
          p_pdf_url: res.pdfUrl ?? null,
          p_xml_url: res.xmlUrl ?? null,
        })
        if (!error) changed = true
      }
    } catch {
      // best-effort: el siguiente listado lo reintenta
    }
  }
  return changed
}

export async function listTaxDocuments(): Promise<Result<TaxDocument[]>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("get_my_tax_documents")
  if (error) return fail("No se pudieron cargar los documentos tributarios")
  let rows = (data ?? []) as Row[]

  // Sondeo perezoso de pendientes (solo proveedor real); si algo cambió,
  // se relee para devolver los estados frescos.
  if (await refreshPendingDocs(supabase, rows)) {
    const { data: fresh } = await supabase.rpc("get_my_tax_documents")
    if (fresh) rows = fresh as Row[]
  }

  return ok(rows.map(mapRow))
}

export type DteEmisorInfo = {
  rut: string
  razonSocial: string
  giro: string
  direccion: string
  comuna: string
  actividadEconomica: string
  logoUrl: string | null
}

/** Documento + datos del emisor + detalle de ítems, para la vista previa imprimible. */
export async function getDocumentForView(
  id: number
): Promise<Result<{ doc: TaxDocument; emisor: DteEmisorInfo; items: TaxDocumentItem[] }>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("get_my_tax_documents")
  if (error) return fail("No se pudo cargar el documento")
  const row = ((data ?? []) as Row[]).find((r) => r.id === id)
  if (!row) return fail("Documento no encontrado")

  const { data: prof } = await supabase.rpc("get_my_tax_profile")
  const emisor: DteEmisorInfo = {
    rut: (prof?.rut as string) ?? "",
    razonSocial: (prof?.razon_social as string) ?? "",
    giro: (prof?.giro as string) ?? "",
    direccion: (prof?.direccion as string) ?? "",
    comuna: (prof?.comuna as string) ?? "",
    actividadEconomica: (prof?.actividad_economica as string) ?? "",
    logoUrl: (prof?.logo_url as string) ?? null,
  }

  const { data: itemsData } = await supabase.rpc("get_tax_document_item_detail", { p_document_id: id })
  return ok({ doc: mapRow(row), emisor, items: mapItems(itemsData) })
}

/**
 * Anula una factura emitiendo automáticamente una nota de crédito (tipo 61) que
 * la referencia (CodRef=1, "Anula documento"), con los mismos montos y receptor.
 * La NC se emite por el adaptador y se registra junto con la marca de anulación
 * de la factura en una sola transacción.
 */
export async function annulDocument(id: number, reason: string): Promise<Result<{ creditNoteId: number }>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error: listErr } = await supabase.rpc("get_my_tax_documents")
  if (listErr) return fail("No se pudo cargar el documento")
  const original = ((data ?? []) as Row[]).map(mapRow).find((d) => d.id === id)
  if (!original) return fail("Documento no encontrado")
  if (original.docType !== 33 && original.docType !== 34) {
    return fail("Solo se puede anular una factura mediante nota de crédito.")
  }
  if (original.voided) return fail("La factura ya fue anulada.")
  if (original.siiStatus !== "accepted") {
    return fail("Solo se puede anular una factura aceptada.")
  }

  // Datos del emisor para el adaptador real (el simulado los ignora).
  const { data: prof } = await supabase.rpc("get_my_tax_profile")
  const emisor = {
    rut: (prof?.rut as string) ?? "",
    razonSocial: (prof?.razon_social as string) ?? "",
  }

  const adapter = getDteAdapter()
  let res
  try {
    res = await adapter.emit({
      type: "nota_credito",
      net: original.net ?? 0,
      iva: original.iva ?? 0,
      total: original.total ?? 0,
      emisor,
      receptor: {
        rut: original.receptorRut,
        razonSocial: original.receptorRazon,
        giro: original.receptorGiro,
        direccion: original.receptorDir,
      },
      reference: {
        docType: original.docType === 34 ? "factura" : "factura",
        folio: original.folio ?? 0,
      },
    })
  } catch (err) {
    logger.error("Fallo al emitir la nota de crédito", err)
    return fail("No se pudo emitir la nota de crédito")
  }

  const { data: ncId, error } = await supabase.rpc("dte_annul_with_credit_note", {
    p_original_id: id,
    p_reason: reason,
    p_sii_status: res.status,
    p_folio: res.folio ?? null,
    p_track_id: res.trackId ?? null,
    p_pdf_url: res.pdfUrl ?? null,
    p_xml_url: res.xmlUrl ?? null,
  })
  if (error) {
    logger.error("No se pudo registrar la nota de crédito", error)
    return fail("No se pudo anular la factura. Reintentá.")
  }

  return ok({ creditNoteId: ncId as number })
}

export async function deleteDocument(id: number): Promise<Result<null>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { error } = await supabase.rpc("dte_delete_document", { p_id: id })
  if (error) return fail("No se pudo borrar el documento")
  return ok(null)
}

export type EmitInput = {
  type: DteType
  /** Monto total (con IVA) del documento. */
  total: number
  receptor?: { rut?: string; razonSocial?: string; giro?: string; direccion?: string }
  paymentId?: number | null
}

/**
 * Emite un documento a través del adaptador configurado (hoy el simulado) y lo
 * registra en tax_documents. Esta es la función que en el futuro llamará el
 * flujo de pago al confirmarse un cobro; hoy también se puede invocar para
 * validar el circuito con el adaptador simulado.
 */
export async function emitDocument(input: EmitInput): Promise<Result<{ id: number; status: string; folio: number | null }>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const total = Math.round(Number(input.total))
  if (!Number.isFinite(total) || total <= 0) return fail("Monto inválido")

  // Documento afecto: se desglosa el IVA (19%) desde el total.
  const net = Math.round(total / 1.19)
  const iva = total - net

  // Datos del emisor (restaurante) para el adaptador real; el simulado los ignora.
  const { data: prof } = await supabase.rpc("get_my_tax_profile")
  const emisor = {
    rut: (prof?.rut as string) ?? "",
    razonSocial: (prof?.razon_social as string) ?? "",
  }

  const adapter = getDteAdapter()
  let res
  try {
    res = await adapter.emit({
      type: input.type,
      net,
      iva,
      total,
      emisor,
      receptor: input.receptor
        ? {
            rut: input.receptor.rut ?? null,
            razonSocial: input.receptor.razonSocial ?? null,
            giro: input.receptor.giro ?? null,
            direccion: input.receptor.direccion ?? null,
          }
        : undefined,
    })
  } catch (err) {
    logger.error("Fallo al emitir DTE con el adaptador", err)
    return fail("No se pudo emitir el documento")
  }

  const { data: docId, error } = await supabase.rpc("dte_record_document", {
    p_doc_type: DTE_SII_CODE[input.type],
    p_net: net,
    p_iva: iva,
    p_total: total,
    p_receptor_rut: input.receptor?.rut ?? null,
    p_receptor_razon: input.receptor?.razonSocial ?? null,
    p_receptor_giro: input.receptor?.giro ?? null,
    p_receptor_dir: input.receptor?.direccion ?? null,
    p_sii_status: res.status,
    p_folio: res.folio ?? null,
    p_track_id: res.trackId ?? null,
    p_pdf_url: res.pdfUrl ?? null,
    p_xml_url: res.xmlUrl ?? null,
    p_payment_id: input.paymentId ?? null,
  })
  if (error) {
    logger.error("DTE emitido pero no se pudo registrar", error)
    return fail("El documento se emitió pero no se pudo registrar. Reintentá.")
  }

  return ok({ id: docId as number, status: res.status, folio: res.folio ?? null })
}

/** Proveedor DTE activo (para que la UI adapte rótulos de simulación). */
export async function getDteProviderInfo(): Promise<Result<{ simulated: boolean; provider: string }>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  return ok({ simulated: isDteSimulated(), provider: getDteAdapter().name })
}

/**
 * Reconsulta el estado de un documento en trámite (worker de sondeo del SII).
 * Con el adaptador simulado no hay pendientes; queda listo para el real.
 */
export async function refreshDocumentStatus(id: number, trackId: string): Promise<Result<null>> {
  const auth = await requireCurrentAdmin()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const adapter = getDteAdapter()
  const res = await adapter.checkStatus(trackId)
  const { error } = await supabase.rpc("dte_update_status", {
    p_id: id,
    p_sii_status: res.status,
    p_folio: res.folio ?? null,
    p_pdf_url: res.pdfUrl ?? null,
    p_xml_url: res.xmlUrl ?? null,
  })
  if (error) return fail("No se pudo actualizar el estado del documento")
  return ok(null)
}
