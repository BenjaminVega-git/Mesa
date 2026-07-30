"use client"

import { useEffect, useState } from "react"
import { Printer, RotateCcw } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { resetTableAction } from "@/app/actions/table-actions"
import { Pagination } from "@/components/ui/Pagination"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useTableList } from "@/hooks/useTableList"
import { CreateTableDialog } from "@/components/admin/CreateTableDialog"

// Detecta si la app corre dentro del wrapper Electron. En ese caso el flujo
// de window.open + window.print no funciona consistentemente (el sistema
// puede no tener una app asociada para el print dialog), así que descargamos
// el PNG directo. En navegador estándar dejamos el flujo de impresión.
function isElectron(): boolean {
  if (typeof navigator === "undefined") return false
  return /electron/i.test(navigator.userAgent)
}

function buildQrUrl(qrCode: string): string {
  const targetUrl = `${window.location.origin}/r/${qrCode}`
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(targetUrl)}`
}

async function downloadTableQr(qrCode: string, tableNumber: number) {
  if (typeof window === "undefined") return
  try {
    const res = await fetch(buildQrUrl(qrCode))
    if (!res.ok) throw new Error("No se pudo descargar el QR")
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = `mesa-${tableNumber}-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    // Como último recurso, abrir la URL en una pestaña (works en browser).
    window.open(buildQrUrl(qrCode), "_blank")
  }
}

// Abre una ventana imprimible con el QR de la mesa a tamaño grande.
// Solo funciona bien en navegador estándar. En Electron usar downloadTableQr.
function printTableQrBrowser(qrCode: string, tableNumber: number) {
  if (typeof window === "undefined") return
  const qrImgSrc = buildQrUrl(qrCode)
  const w = window.open("", "_blank", "width=520,height=620")
  if (!w) return
  w.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>QR Mesa ${tableNumber}</title>
<style>
  body { margin: 0; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  img { display: block; width: 480px; height: 480px; }
  @media print { body { min-height: auto; } }
</style>
</head>
<body>
  <img src="${qrImgSrc}" alt="QR Mesa ${tableNumber}" />
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body>
</html>`)
  w.document.close()
}

function handleTableQr(qrCode: string, tableNumber: number) {
  if (isElectron()) {
    downloadTableQr(qrCode, tableNumber)
  } else {
    printTableQrBrowser(qrCode, tableNumber)
  }
}

export default function TablesPage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<{ id: number; number: number } | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const {
    tables,
    totalTables,
    totalPages,
    loading,
    deleting,
    error,
    deleteTable,
    deleteDialog,
    refresh,
  } = useTableList({ page: currentPage, pageSize: 12 })

  useEffect(() => {
    if (!loading && currentPage > totalPages) {
      queueMicrotask(() => setCurrentPage(totalPages))
    }
  }, [currentPage, totalPages, loading])

  async function handleResetTable() {
    if (!resetTarget || resetting) return
    setResetting(true)
    setResetError(null)
    const result = await resetTableAction(
      resetTarget.id,
      "Reset manual desde panel de mesas"
    )
    setResetting(false)
    if (!result.ok) {
      setResetError(result.error)
      return
    }
    setResetTarget(null)
    refresh()
  }

  return (
    <div className="space-y-6">
      {deleteDialog}
      <ConfirmDialog
        open={resetTarget !== null}
        title={`Resetear Mesa ${resetTarget?.number ?? ""}`}
        description="Esto libera la mesa, limpia comensales, carrito y llamadas pendientes. Si hay pedidos activos, se cancelan y se revierte el stock descontado."
        confirmLabel={resetting ? "Reseteando..." : "Resetear mesa"}
        cancelLabel="Mantener mesa"
        onCancel={() => {
          if (!resetting) setResetTarget(null)
        }}
        onConfirm={handleResetTable}
      />

      <CreateTableDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refresh}
      />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Mesas y Códigos QR</h2>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-700 ring-1 ring-stone-200">
              {totalTables}
            </span>
          </div>
          <p className="text-sm text-stone-600">
            Administración de mesas del local y descarga de códigos QR para clientes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          aria-label="Crear mesa"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/35"
        >
          <span>+ Agregar Mesa</span>
        </button>
      </div>

      {loading && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center text-xs font-semibold text-stone-500 animate-pulse">
          Cargando mesas del local...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-xs font-bold text-red-650 shadow-sm">
          {error}
        </div>
      )}

      {resetError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-xs font-bold text-red-650 shadow-sm">
          {resetError}
        </div>
      )}

      {!loading && !error && tables.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center shadow-inner">
          <h3 className="font-bold text-stone-900">No hay mesas registradas</h3>
          <p className="mx-auto mt-2 max-w-xs text-xs text-stone-550 leading-relaxed">
            Crea tu primera mesa para que los clientes puedan escanear su código QR e iniciar un pedido digital.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600"
          >
            + Crear primera mesa
          </button>
        </div>
      )}

      {!loading && !error && tables.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((table) => (
              <article
                key={table.id}
                className="flex min-w-0 flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
              >
                <div>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-stone-900">
                        Mesa {table.table_number}
                      </h3>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-stone-500">
                        Código: {table.qr_codes.qr_code}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/10">
                      QR Listo
                    </span>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-center">
                    <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-xl bg-white p-2.5 shadow-sm">
                      <QRCodeSVG
                        value={`${process.env.NEXT_PUBLIC_APP_URL}/r/${table.qr_codes.qr_code}`}
                        size={92}
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold text-stone-500">
                      Escaneo de menú directo
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTableQr(table.qr_codes.qr_code, table.table_number)}
                    className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-center text-xs font-bold text-stone-700 transition hover:bg-stone-100"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    Imprimir QR
                  </button>

                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => {
                      setResetError(null)
                      setResetTarget({ id: table.id, number: table.table_number })
                    }}
                    className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-center text-xs font-bold text-amber-700 transition hover:bg-amber-100/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset
                  </button>

                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async () => {
                      await deleteTable(table.id, table.qr_code_id)
                    }}
                    className="min-w-0 rounded-xl border border-red-250 bg-red-50 py-2.5 text-center text-xs font-bold text-red-600 transition hover:bg-red-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            disabled={loading || deleting}
          />
        </>
      )}
    </div>
  )
}
