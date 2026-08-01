import { getPaymentReceipt } from "@/services/charge-service"
import { DocumentActions } from "@/components/dte/DocumentActions"
import { DocumentView } from "@/components/dte/DocumentView"

export const dynamic = "force-dynamic"

/**
 * Boleta imprimible de un COBRO (por payment_id), accesible para el staff
 * (mesero o admin). Es la vista que se abre tras cobrar desde el panel o la
 * app del mesero. La versión por documento (/documento/[id]) sigue siendo
 * solo del admin.
 */
export default async function BoletaPage({
  params,
}: {
  params: Promise<{ paymentId: string }>
}) {
  const { paymentId } = await params
  const result = await getPaymentReceipt(Number(paymentId))

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {result.error}
        </p>
      </main>
    )
  }

  const { doc, emisor, items } = result.data

  return (
    <main className="mx-auto max-w-2xl p-6 print:p-0">
      <div className="mb-5 flex items-center justify-end gap-3 print:hidden">
        <DocumentActions
          doc={{
            id: doc.id,
            docType: doc.docType,
            folio: doc.folio,
            net: doc.net,
            iva: doc.iva,
            total: doc.total,
            tip: doc.tip,
            receptorRut: doc.receptorRut,
            receptorRazon: doc.receptorRazon,
            trackId: doc.trackId,
            pdfUrl: doc.pdfUrl,
            xmlUrl: doc.xmlUrl,
            emittedAt: doc.emittedAt,
            simulated: doc.simulated,
          }}
          emisor={{ rut: emisor.rut, razonSocial: emisor.razonSocial }}
          officialPdfHref={`/api/dte-pdf?payment=${Number(paymentId)}`}
          items={items}
        />
      </div>

      <DocumentView
        doc={{
          id: doc.id,
          docType: doc.docType,
          folio: doc.folio,
          net: doc.net,
          iva: doc.iva,
          total: doc.total,
          tip: doc.tip,
          receptorRut: doc.receptorRut,
          receptorRazon: doc.receptorRazon,
          receptorGiro: doc.receptorGiro,
          receptorDir: doc.receptorDir,
          trackId: doc.trackId,
          emittedAt: doc.emittedAt,
          simulated: doc.simulated,
        }}
        emisor={emisor}
        items={items}
      />
    </main>
  )
}
