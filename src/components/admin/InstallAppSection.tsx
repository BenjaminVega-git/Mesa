import { Download } from "lucide-react"
import { APP_DOWNLOADS } from "@/lib/app-version"

/**
 * Instaladores nativos (Windows y Android) publicados como GitHub Releases.
 * Las tarjetas de PWA (panel admin y app del mesero por navegador) se
 * quitaron a pedido del cliente: este módulo ofrece SOLO los instaladores.
 * La PWA sigue disponible por el navegador (menú ⋮ → Instalar) y el botón
 * de /waiter/login; la infraestructura (manifest + admin-sw) queda intacta.
 */
function DownloadsCard() {
  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-stone-200 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
          📦
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight text-stone-900">
              Instaladores para descargar
            </h3>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600 ring-1 ring-stone-200">
              v{APP_DOWNLOADS.version}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Descargá la app para cada equipo: el panel de administración para
            Windows y la app del mesero para Android.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {/* Windows */}
            <div className="flex flex-col rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🪟</span>
                <p className="text-sm font-bold text-stone-800">Windows · Panel de administración</p>
              </div>
              <p className="mt-1 flex-1 text-xs text-stone-500">
                Programa de escritorio del panel. Se actualiza solo: descarga las
                versiones nuevas en segundo plano y te avisa para reiniciar.
              </p>
              <a
                href={APP_DOWNLOADS.windows.url}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Descargar instalador (.exe)
              </a>
              <p className="mt-2 text-[11px] leading-4 text-stone-400">
                Si Windows muestra un aviso de seguridad, elegí{" "}
                <strong>Más información → Ejecutar de todas formas</strong>{" "}
                (instalador sin firma comercial).
              </p>
            </div>

            {/* Android */}
            <div className="flex flex-col rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <p className="text-sm font-bold text-stone-800">Android · App del mesero</p>
              </div>
              <p className="mt-1 flex-1 text-xs text-stone-500">
                App nativa con escáner QR con cámara. El contenido se actualiza
                solo con cada mejora; si publicamos una app nueva, avisa adentro
                con el link de descarga.
              </p>
              <a
                href={APP_DOWNLOADS.android.url}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Descargar app (.apk)
              </a>
              <p className="mt-2 text-[11px] leading-4 text-stone-400">
                En el teléfono: abrir el archivo y permitir{" "}
                <strong>instalar apps de origen desconocido</strong> si lo pide
                (se instala fuera de Play Store).
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-stone-500">
            <span className="mt-0.5 text-emerald-600">✓</span>
            <p>
              <strong className="text-stone-700">Siempre al día:</strong> ambas
              apps cargan el sistema en vivo, así que cada mejora que publicamos
              les llega sola. Además detectan cuando hay una versión nueva del
              programa y te avisan para actualizarlo.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function InstallAppSection() {
  return (
    <div className="space-y-6">
      <DownloadsCard />
    </div>
  )
}
