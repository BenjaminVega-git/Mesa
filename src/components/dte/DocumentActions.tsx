"use client"

import { useState } from "react"
import { getKnownPrinter, connectBluetoothPrinter, connectSerialPrinter, sendTicket, isWebBluetoothAvailable, isWebSerialAvailable } from "@/lib/printer"
import { buildReceiptTicket } from "@/lib/printer/escpos"
import { FRIENDLY_LABEL } from "./DocumentView"
import { logger } from "@/lib/logger"

type Props = {
  doc: {
    id: number
    docType: number
    folio: number | null
    net: number | null
    iva: number | null
    total: number | null
    receptorRut: string | null
    receptorRazon: string | null
    trackId: string | null
    pdfUrl: string | null
    xmlUrl: string | null
    emittedAt: string | null
    simulated: boolean
  }
  emisor: { rut: string; razonSocial: string }
  /** Link al PDF oficial del proveedor (con timbre real). Solo con proveedor
   *  DTE real; tiene prioridad sobre el print HTML. */
  officialPdfHref?: string | null
}

/** XML representativo del documento (para el modo simulado). NO es un DTE válido. */
function buildXml(d: Props["doc"], emisor: Props["emisor"]): string {
  const esc = (s: string | number | null) =>
    String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<!-- Documento SIMULADO generado por MESA. Sin validez tributaria ante el SII. -->
<DTE version="1.0">
  <Documento ID="MESA-${esc(d.id)}">
    <Encabezado>
      <IdDoc>
        <TipoDTE>${esc(d.docType)}</TipoDTE>
        <Folio>${esc(d.folio)}</Folio>
        <FchEmis>${esc(d.emittedAt ? d.emittedAt.slice(0, 10) : "")}</FchEmis>
      </IdDoc>
      <Emisor>
        <RUTEmisor>${esc(emisor.rut)}</RUTEmisor>
        <RznSoc>${esc(emisor.razonSocial)}</RznSoc>
      </Emisor>
      <Receptor>
        <RUTRecep>${esc(d.receptorRut)}</RUTRecep>
        <RznSocRecep>${esc(d.receptorRazon)}</RznSocRecep>
      </Receptor>
      <Totales>
        <MntNeto>${esc(d.net)}</MntNeto>
        <IVA>${esc(d.iva)}</IVA>
        <MntTotal>${esc(d.total)}</MntTotal>
      </Totales>
    </Encabezado>
    <TrackID>${esc(d.trackId)}</TrackID>
  </Documento>
</DTE>`
}

export function DocumentActions({ doc, emisor, officialPdfHref }: Props) {
  const [printingThermal, setPrintingThermal] = useState(false)
  const [thermalError, setThermalError] = useState<string | null>(null)
  const thermalSupported = isWebBluetoothAvailable() || isWebSerialAvailable()

  async function printThermal() {
    if (printingThermal) return
    setPrintingThermal(true)
    setThermalError(null)
    try {
      // Reconecta en silencio a la impresora ya emparejada en /admin/printer
      // (Bluetooth o cable); solo si no hay ninguna conocida abre el selector.
      let printer = await getKnownPrinter()
      if (!printer) {
        printer = isWebBluetoothAvailable() ? await connectBluetoothPrinter() : await connectSerialPrinter()
      }
      const ticket = buildReceiptTicket({
        restaurantName: emisor.razonSocial || "Restaurante",
        restaurantRut: emisor.rut,
        docLabel: FRIENDLY_LABEL[doc.docType] ?? "Comprobante de pago",
        folio: doc.folio,
        emittedAt: doc.emittedAt,
        net: doc.net,
        iva: doc.iva,
        total: doc.total,
      })
      await sendTicket(printer, ticket)
    } catch (err) {
      logger.error("thermal receipt print failed", { error: String(err) })
      setThermalError(err instanceof Error ? err.message : "No se pudo imprimir en la impresora térmica")
    } finally {
      setPrintingThermal(false)
    }
  }

  function print() {
    // Marca el body para que el @media print muestre solo el documento
    // (data-print-root), sirva desde la página o desde el modal de vista previa.
    document.body.setAttribute("data-printing", "")
    const cleanup = () => {
      document.body.removeAttribute("data-printing")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    window.print()
    // Respaldo por si afterprint no dispara.
    setTimeout(cleanup, 1000)
  }

  function downloadXml() {
    if (doc.xmlUrl) {
      window.open(doc.xmlUrl, "_blank", "noopener")
      return
    }
    const blob = new Blob([buildXml(doc, emisor)], { type: "application/xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `documento-${doc.folio ?? doc.id}.xml`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const pdfHref = doc.pdfUrl ?? (!doc.simulated ? officialPdfHref : null)

  return (
    <div data-print-hide className="flex flex-wrap items-start gap-3 print:hidden">
      {thermalSupported && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={printThermal}
            disabled={printingThermal}
            className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {printingThermal ? "Imprimiendo..." : "🖨️ Imprimir en impresora térmica"}
          </button>
          {thermalError && <p className="max-w-xs text-xs font-medium text-red-600">{thermalError}</p>}
        </div>
      )}
      {pdfHref ? (
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          Descargar PDF oficial
        </a>
      ) : (
        <button
          type="button"
          onClick={print}
          className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          Imprimir / Guardar PDF
        </button>
      )}
      {/* El XML stub solo tiene sentido en simulación; con proveedor real se
          ofrece únicamente si hay xmlUrl verdadero. */}
      {(doc.simulated || doc.xmlUrl) && (
        <button
          type="button"
          onClick={downloadXml}
          className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
        >
          Descargar XML
        </button>
      )}
    </div>
  )
}
