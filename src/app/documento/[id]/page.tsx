import { getDocumentForView } from "@/services/dte-service"
import { DocumentActions } from "@/components/dte/DocumentActions"
import { DocumentView } from "@/components/dte/DocumentView"

export const dynamic = "force-dynamic"

export default async function DocumentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getDocumentForView(Number(id))

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
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <a href="/admin/pagos" className="text-sm font-semibold text-stone-500 transition hover:text-orange-600">
          ← Volver a Pagos
        </a>
        <DocumentActions
          doc={doc}
          emisor={{ rut: emisor.rut, razonSocial: emisor.razonSocial }}
          officialPdfHref={`/api/dte-pdf?doc=${doc.id}`}
        />
      </div>

      <DocumentView doc={doc} emisor={emisor} items={items} />
    </main>
  )
}
