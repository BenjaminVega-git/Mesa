"use client"

import { DTE_LABEL_BY_CODE } from "@/lib/dte/types"

export type DocumentViewData = {
  id: number
  docType: number
  folio: number | null
  net: number | null
  iva: number | null
  total: number | null
  tip?: number | null
  receptorRut: string | null
  receptorRazon: string | null
  receptorGiro: string | null
  receptorDir: string | null
  trackId: string | null
  emittedAt: string | null
  simulated: boolean
  voided?: boolean
  refDocType?: number | null
  refFolio?: number | null
  refCode?: number | null
  refReason?: string | null
}

/** Línea real del pedido cobrado — order_items no se borra al cobrar, así
 *  que el detalle sigue siendo recuperable aunque tax_documents no lo guarde. */
export type DocumentViewItem = {
  name: string
  variantName: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

const COD_REF_LABEL: Record<number, string> = {
  1: "Anula documento de referencia",
  2: "Corrige texto",
  3: "Corrige montos",
}

export type DocumentViewEmisor = {
  rut: string
  razonSocial: string
  giro: string
  direccion: string
  comuna: string
  actividadEconomica: string
  logoUrl: string | null
}

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})

function fmtDate(v: string | null): string {
  if (!v) return "—"
  return new Date(v).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p className="text-xs leading-5 text-stone-700">
      <span className="font-semibold text-stone-500">{label}:</span> {value?.trim() ? value : "—"}
    </p>
  )
}

/**
 * Representación imprimible de un documento tributario electrónico chileno,
 * siguiendo la estructura exigida por el SII para la representación impresa:
 * datos del emisor + logo, recuadro rojo (RUT, tipo, folio, unidad SII),
 * receptor (en factura), detalle, totales con desglose de IVA, y el área de
 * timbre electrónico (PDF417 + resolución + leyenda de verificación). La
 * factura incluye además la leyenda de acuse de recibo (Ley N° 19.983).
 * data-print-root permite imprimir solo el documento.
 */
// Etiqueta amigable para el comensal — deliberadamente distinta de
// DTE_LABEL_BY_CODE (esa es la clasificación tributaria interna/admin). Este
// comprobante no reclama validez ante el SII, así que no se llama "boleta
// electrónica" ni luce el recuadro/timbre oficial.
export const FRIENDLY_LABEL: Record<number, string> = {
  33: "Comprobante de pago (factura)",
  34: "Comprobante de pago (factura exenta)",
  39: "Comprobante de pago",
  41: "Comprobante de pago",
  56: "Nota de débito",
  61: "Nota de crédito",
}

// Un acento de color por tipo de documento — antes todo el comprobante era
// monocromático stone, sin ninguna forma rápida de distinguir a simple vista
// una boleta de una factura o una nota de crédito.
const ACCENT = {
  boleta: { bar: "bg-orange-500", badgeBg: "bg-orange-50", badgeRing: "ring-orange-200", badgeText: "text-orange-700", totalBg: "bg-orange-50" },
  factura: { bar: "bg-sky-500", badgeBg: "bg-sky-50", badgeRing: "ring-sky-200", badgeText: "text-sky-700", totalBg: "bg-sky-50" },
  notaCredito: { bar: "bg-red-500", badgeBg: "bg-red-50", badgeRing: "ring-red-200", badgeText: "text-red-700", totalBg: "bg-red-50" },
} as const

export function DocumentView({
  doc,
  emisor,
  items,
}: {
  doc: DocumentViewData
  emisor: DocumentViewEmisor
  items?: DocumentViewItem[]
}) {
  const label = FRIENDLY_LABEL[doc.docType] ?? "Comprobante de pago"
  const esFactura = doc.docType === 33 || doc.docType === 34
  const esBoleta = doc.docType === 39 || doc.docType === 41
  const esNotaCredito = doc.docType === 61
  const accent = esFactura ? ACCENT.factura : esNotaCredito ? ACCENT.notaCredito : ACCENT.boleta
  const tip = Math.max(0, Math.round(doc.tip ?? 0))

  return (
    <article
      data-print-root
      className="overflow-hidden rounded-2xl border border-stone-200 bg-white text-stone-900 shadow-sm print:border-0 print:shadow-none"
    >
      <div className={`h-1.5 ${accent.bar} print:hidden`} aria-hidden="true" />
      <div className="p-8">
      {doc.voided ? (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-red-700">
          Documento anulado por nota de crédito
        </div>
      ) : null}

      {/* Encabezado: emisor + logo (izq) y comprobante N° (der) */}
      <div className="flex items-start justify-between gap-6 border-b border-stone-200 pb-5">
        <div className="flex items-start gap-4">
          {emisor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emisor.logoUrl} alt="Logo" className="h-16 w-16 shrink-0 rounded-lg object-contain" />
          ) : null}
          <div>
            <p className="text-base font-extrabold tracking-tight text-stone-900">
              {emisor.razonSocial || "Restaurante"}
            </p>
            <div className="mt-1 space-y-0.5">
              <Field
                label="Dirección"
                value={[emisor.direccion, emisor.comuna].filter((s) => s?.trim()).join(", ") || null}
              />
              {emisor.rut?.trim() ? <Field label="RUT" value={emisor.rut} /> : null}
            </div>
          </div>
        </div>

        {/* rounded-2xl + ring + relleno de color quedan bien en pantalla, pero
            un cabezal térmico monocromo no reproduce esos bordes/rellenos
            suaves — los "difumina" en ruido visible ("borroso"). En print se
            reemplazan por un recuadro simple de líneas rectas, sin relleno. */}
        <div
          className={`shrink-0 rounded-2xl px-5 py-3 text-right ring-1 ${accent.badgeBg} ${accent.badgeRing} print:rounded-none print:border print:border-stone-400 print:bg-transparent print:ring-0`}
        >
          <p className={`text-[11px] font-bold uppercase tracking-wide ${accent.badgeText} print:text-stone-900`}>
            {label}
          </p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-stone-900">N° {doc.folio ?? "—"}</p>
        </div>
      </div>

      {/* Fecha */}
      <div className="mt-4 text-xs text-stone-600">
        Fecha: <strong className="text-stone-800">{fmtDate(doc.emittedAt)}</strong>
      </div>

      {/* Receptor: obligatorio en factura; en boleta solo si se registró */}
      {esFactura || doc.receptorRut || doc.receptorRazon ? (
        <div className="mt-4 rounded-lg bg-stone-50 px-4 py-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-500">
            {esFactura ? "Señor(es) — Receptor" : "Receptor"}
          </p>
          <div className="grid gap-x-8 gap-y-0.5 sm:grid-cols-2">
            <Field label="Razón social" value={doc.receptorRazon} />
            <Field label="R.U.T." value={doc.receptorRut} />
            {esFactura ? <Field label="Giro" value={doc.receptorGiro} /> : null}
            {esFactura ? <Field label="Dirección" value={doc.receptorDir} /> : null}
          </div>
        </div>
      ) : null}

      {/* Condición de venta (factura) */}
      {esFactura ? (
        <div className="mt-3 text-xs text-stone-600">
          Condición de venta: <strong className="text-stone-800">Contado</strong>
        </div>
      ) : null}

      {/* Referencia (obligatoria en nota de crédito) */}
      {esNotaCredito ? (
        <div className="mt-4 rounded-lg border border-stone-200 px-4 py-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-500">Referencia</p>
          <div className="grid gap-x-8 gap-y-0.5 sm:grid-cols-2">
            <Field
              label="Documento"
              value={
                doc.refDocType
                  ? `${DTE_LABEL_BY_CODE[doc.refDocType] ?? `Tipo ${doc.refDocType}`} N° ${doc.refFolio ?? "—"}`
                  : null
              }
            />
            <Field
              label="Código"
              value={doc.refCode ? `${doc.refCode} — ${COD_REF_LABEL[doc.refCode] ?? ""}` : "1 — Anula documento de referencia"}
            />
            <Field label="Motivo" value={doc.refReason} />
          </div>
        </div>
      ) : null}

      {/* Detalle: ítems reales del pedido cobrado cuando están disponibles
          (no se borran al cobrar); si no, la línea genérica de siempre. */}
      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className={`border-y border-stone-200 text-left text-[10px] font-bold uppercase tracking-wider ${accent.badgeText}`}>
            <th className="py-1.5 pr-3">Descripción</th>
            <th className="py-1.5 pr-3 text-right">Cant.</th>
            <th className="py-1.5 pr-3 text-right">P. unitario</th>
            <th className="py-1.5 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {items && items.length > 0 ? (
            items.map((item, i) => (
              <tr key={i} className="border-b border-stone-100 last:border-b-0">
                <td className="py-2 pr-3 text-stone-800">
                  {item.name}
                  {item.variantName ? <span className="text-stone-400"> · {item.variantName}</span> : null}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-700">{item.quantity}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-700">{clp.format(item.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-stone-900">{clp.format(item.lineTotal)}</td>
              </tr>
            ))
          ) : (
            <tr className="border-b border-stone-100">
              <td className="py-2 pr-3 text-stone-800">
                {esNotaCredito
                  ? `Anulación de ${DTE_LABEL_BY_CODE[doc.refDocType ?? 33] ?? "factura"} N° ${doc.refFolio ?? "—"}`
                  : "Consumo / Servicios"}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-stone-700">1</td>
              <td className="py-2 pr-3 text-right tabular-nums text-stone-700">
                {esBoleta ? clp.format(doc.total ?? 0) : clp.format(doc.net ?? 0)}
              </td>
              <td className="py-2 text-right tabular-nums font-semibold text-stone-900">
                {esBoleta ? clp.format(doc.total ?? 0) : clp.format(doc.net ?? 0)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totales */}
      <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
        {esBoleta ? (
          <>
            <div className="flex justify-between text-[11px] text-stone-500">
              <span>Neto</span>
              <span className="tabular-nums">{doc.net != null ? clp.format(doc.net) : "—"}</span>
            </div>
            {tip > 0 ? (
              <div className="flex justify-between text-[11px] font-semibold text-stone-700">
                <span>Propina</span>
                <span className="tabular-nums">{clp.format(tip)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-[11px] text-stone-500">
              <span>IVA (19%) incluido</span>
              <span className="tabular-nums">{doc.iva != null ? clp.format(doc.iva) : "—"}</span>
            </div>
            <div
              className={`flex justify-between rounded-xl px-3 py-2 text-base font-extrabold text-stone-900 ${accent.totalBg} print:rounded-none print:bg-transparent print:border-t-2 print:border-stone-900`}
            >
              <span>Total (IVA incluido)</span>
              <span className="tabular-nums">{doc.total != null ? clp.format(doc.total) : "—"}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between text-stone-600">
              <span>Monto neto</span>
              <span className="tabular-nums">{doc.net != null ? clp.format(doc.net) : "—"}</span>
            </div>
            {tip > 0 ? (
              <div className="flex justify-between font-semibold text-stone-700">
                <span>Propina</span>
                <span className="tabular-nums">{clp.format(tip)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-stone-600">
              <span>IVA (19%)</span>
              <span className="tabular-nums">{doc.iva != null ? clp.format(doc.iva) : "—"}</span>
            </div>
            <div
              className={`flex justify-between rounded-xl px-3 py-2 text-base font-extrabold text-stone-900 ${accent.totalBg} print:rounded-none print:bg-transparent print:border-t-2 print:border-stone-900`}
            >
              <span>Total</span>
              <span className="tabular-nums">{doc.total != null ? clp.format(doc.total) : "—"}</span>
            </div>
          </>
        )}
      </div>

      {/* Cierre */}
      <div className="mt-8 border-t border-dashed border-stone-200 pt-5 text-center">
        <p className="text-sm font-bold text-stone-700">¡Gracias por tu visita!</p>
        <p className="mt-1 text-xs font-semibold text-stone-400">tumesaqr.com</p>
        {doc.trackId ? (
          <p className="mt-1 text-[10px] text-stone-400">Referencia {doc.trackId}</p>
        ) : null}
      </div>
      </div>
    </article>
  )
}
