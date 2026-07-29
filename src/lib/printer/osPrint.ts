import type { TicketInput, ReceiptInput } from "@/lib/printer/escpos"

/**
 * Impresión vía el controlador del sistema operativo, en vez de hablarle
 * directo a la impresora por Bluetooth. Es la vía universal: funciona con
 * CUALQUIER impresora que Windows/macOS ya sepa imprimir (instalada como
 * impresora normal), delegando todo el ancho/calidad de página al driver
 * en vez de asumir un tamaño fijo.
 *
 * Desde un navegador normal, window.print() SIEMPRE muestra el diálogo del
 * sistema — es una restricción de seguridad que ninguna página web puede
 * evitar. Dentro de la app de escritorio (Electron) SÍ es posible imprimir
 * en silencio: electron/preload.js expone window.electronAPI.printSilently,
 * que llama a webContents.print({silent:true}) desde el proceso principal.
 * Si hay una impresora de Electron configurada (ver getStoredElectronPrinter),
 * se usa esa vía silenciosa; si no, cae al diálogo de siempre.
 *
 * Dos ajustes clave (reportados por usuarios reales):
 * - "salió casi sin nada de color": el contenido es HTML con negritas
 *   fuertes (700-800) + print-color-adjust:exact, no texto plano con peso
 *   normal (que en varias impresoras/drivers sale muy tenue).
 * - "no se ajusta a las dimensiones de la impresora": se resetean los
 *   márgenes de página (@page { margin:0 }) y el ticket usa width:100%
 *   en vez de un ancho fijo en mm — así ocupa todo el ancho que el driver
 *   de esa impresora ya tenga configurado (58mm, 80mm, lo que sea) en vez
 *   de asumir un tamaño y quedar cortado o con espacio de más.
 *
 * Reusa el mismo patrón que src/components/dte/DocumentActions.tsx (marca
 * data-printing en <body> + data-print-root en el elemento a imprimir; la
 * regla @media print ya existe en globals.css) en vez de un elemento
 * siempre montado en el árbol de React.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}

function ticketShell(bodyHtml: string): string {
  return `
    <div style="
      width:100%;
      background:#fff;
      color:#000;
      font-family:Arial,Helvetica,sans-serif;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
      padding:0 1mm;
      box-sizing:border-box;
    ">
      ${bodyHtml}
    </div>
  `
}

const HR = `<div style="border-top:2px solid #000; margin:2mm 0;"></div>`
const HR_DASHED = `<div style="border-top:1.5px dashed #000; margin:2mm 0;"></div>`

/** Comanda de cocina: refleja el pedido real (mesa, N°, ítems y cantidades). */
export function buildTicketHtml(input: TicketInput): string {
  const items = input.items
    .map(
      (item) => `
        <tr>
          <td style="font-weight:800; font-size:13px; padding-right:2mm; vertical-align:top;">${item.quantity}x</td>
          <td style="font-weight:700; font-size:13px; vertical-align:top;">${escapeHtml(item.name)}</td>
        </tr>
      `
    )
    .join("")

  return ticketShell(`
    <div style="text-align:center; font-weight:800; font-size:17px; text-transform:uppercase; letter-spacing:0.5px;">
      ${escapeHtml(input.restaurantName)}
    </div>
    ${HR}
    <div style="font-weight:800; font-size:15px;">Mesa ${escapeHtml(String(input.tableNumber))}</div>
    <div style="font-weight:700; font-size:13px;">Pedido #${input.orderId}</div>
    ${HR}
    <table style="width:100%; border-collapse:collapse;">${items}</table>
    ${HR}
    <div style="text-align:center; font-weight:700; font-size:11px;">tumesaqr.com</div>
  `)
}

/** Comprobante de pago: mismo contenido que la vía Bluetooth (buildReceiptTicket), en HTML nítido. */
export function buildReceiptHtml(input: ReceiptInput): string {
  const clp = (n: number | null) => (n != null ? `$${Math.round(n).toLocaleString("es-CL")}` : "—")
  const fecha = (() => {
    if (!input.emittedAt) return "—"
    const d = new Date(input.emittedAt)
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })
  })()

  const row = (label: string, value: string, bold = false) => `
    <div style="display:flex; justify-content:space-between; font-weight:${bold ? 800 : 700}; font-size:${bold ? 14 : 13}px;">
      <span>${label}</span><span>${value}</span>
    </div>
  `

  return ticketShell(`
    <div style="text-align:center; font-weight:800; font-size:17px; text-transform:uppercase;">
      ${escapeHtml(input.restaurantName)}
    </div>
    ${input.restaurantRut ? `<div style="text-align:center; font-weight:700; font-size:12px;">RUT ${escapeHtml(input.restaurantRut)}</div>` : ""}
    ${HR}
    <div style="text-align:center; font-weight:800; font-size:14px;">${escapeHtml(input.docLabel)}</div>
    ${input.folio != null ? `<div style="text-align:center; font-weight:700; font-size:13px;">N° ${input.folio}</div>` : ""}
    <div style="text-align:center; font-weight:700; font-size:12px;">${fecha}</div>
    ${HR_DASHED}
    ${row("Neto", clp(input.net))}
    ${row("IVA", clp(input.iva))}
    ${row("TOTAL", clp(input.total), true)}
    ${HR}
    <div style="text-align:center; font-weight:700; font-size:12px;">Gracias por tu visita</div>
    <div style="text-align:center; font-weight:700; font-size:11px;">tumesaqr.com</div>
  `)
}

const ELECTRON_PRINTER_STORAGE_KEY = "mesa-printer-electron-device"

/** true solo dentro de la app de escritorio (nunca en un navegador normal). */
export function isElectronPrintAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron)
}

export async function listElectronPrinters() {
  if (!isElectronPrintAvailable()) return []
  try {
    return await window.electronAPI!.listPrinters()
  } catch {
    return []
  }
}

export function getStoredElectronPrinter(): string {
  try {
    return localStorage.getItem(ELECTRON_PRINTER_STORAGE_KEY) || ""
  } catch {
    return ""
  }
}

export function setStoredElectronPrinter(deviceName: string): void {
  try {
    localStorage.setItem(ELECTRON_PRINTER_STORAGE_KEY, deviceName)
  } catch {
    // no crítico
  }
}

async function waitForPrintContentReady(root: HTMLElement): Promise<void> {
  await Promise.resolve(document.fonts?.ready).catch(() => undefined)

  const images = Array.from(root.querySelectorAll("img"))
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true })
        img.addEventListener("error", () => resolve(), { once: true })
      })
    })
  )

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  // Forzar layout antes de la impresion silenciosa. Sin dialogo nativo no hay
  // pausa humana, y algunos drivers capturan blanco si se imprime en el mismo
  // tick en que se inserto el ticket.
  root.getBoundingClientRect()
}

async function printHtml(html: string): Promise<void> {
  if (typeof window === "undefined") return

  // La regla global body[data-printing] [data-print-root] en globals.css ya
  // fuerza position:absolute + width:100% + margin/padding:0 en este nodo.
  const root = document.createElement("div")
  root.setAttribute("data-print-root", "")
  root.innerHTML = html
  document.body.appendChild(root)
  document.body.setAttribute("data-printing", "")

  const cleanup = () => {
    document.body.removeAttribute("data-printing")
    root.remove()
  }

  const electronDevice = getStoredElectronPrinter()
  if (isElectronPrintAvailable() && electronDevice) {
    try {
      await waitForPrintContentReady(root)
      const result = await window.electronAPI!.printSilently(electronDevice)
      if (!result.success) {
        throw new Error(result.errorType || "La app de escritorio no pudo imprimir")
      }
    } finally {
      cleanup()
    }
    return
  }

  // Navegador normal (o Electron sin impresora elegida todavía): diálogo del
  // sistema. Sin esto, el margen de página por defecto (~1-2cm por lado) se
  // come casi todo el ancho de un rollo térmico de 58/80mm.
  const pageStyle = document.createElement("style")
  pageStyle.textContent = "@page { size: auto; margin: 0; }"
  document.head.appendChild(pageStyle)

  await waitForPrintContentReady(root)

  await new Promise<void>((resolve) => {
    const finish = () => {
      window.removeEventListener("afterprint", finish)
      pageStyle.remove()
      cleanup()
      resolve()
    }
    window.addEventListener("afterprint", finish)
    window.print()
    // Respaldo por si afterprint no dispara (algunos navegadores).
    setTimeout(finish, 3000)
  })
}

export async function printTicketViaOsDriver(input: TicketInput): Promise<void> {
  await printHtml(buildTicketHtml(input))
}

export async function printReceiptViaOsDriver(input: ReceiptInput): Promise<void> {
  await printHtml(buildReceiptHtml(input))
}
