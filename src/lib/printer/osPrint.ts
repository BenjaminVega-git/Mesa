import type { TicketInput } from "@/lib/printer/escpos"

/**
 * Impresión vía el controlador del sistema operativo, en vez de hablarle
 * directo a la impresora por Bluetooth/cable (Web Serial). Es la vía
 * universal: funciona con CUALQUIER impresora que Windows/macOS ya sepa
 * imprimir (instalada como impresora normal), sin depender de si el cable
 * expone un puerto serie o de qué chip USB-a-serie tenga.
 *
 * Contra: window.print() siempre muestra el diálogo de impresión del
 * sistema — a diferencia de Bluetooth/cable, esta vía no es 100% silenciosa
 * (hay que confirmar cada ticket).
 *
 * El ticket se construye como HTML (no como texto plano monoespaciado):
 * negritas fuertes + alto contraste + print-color-adjust:exact, porque en
 * varias impresoras/drivers el texto normal a 12px sale MUY tenue —
 * reportado por un usuario ("salió casi sin nada de color").
 *
 * Reusa el mismo patrón que src/components/dte/DocumentActions.tsx (marca
 * data-printing en <body> + data-print-root en el elemento a imprimir; la
 * regla @media print ya existe en globals.css) en vez de un elemento
 * siempre montado en el árbol de React.
 */

const TICKET_WIDTH_MM = 58

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}

function ticketShell(bodyHtml: string): string {
  return `
    <div style="
      width:${TICKET_WIDTH_MM}mm;
      background:#fff;
      color:#000;
      font-family:Arial,Helvetica,sans-serif;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
      padding:2mm 1mm;
    ">
      ${bodyHtml}
    </div>
  `
}

const HR = `<div style="border-top:2px solid #000; margin:2mm 0;"></div>`

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

function printHtml(html: string): void {
  if (typeof window === "undefined") return

  const root = document.createElement("div")
  root.setAttribute("data-print-root", "")
  root.style.cssText = "position:fixed;top:0;left:0;"
  root.innerHTML = html
  document.body.appendChild(root)
  document.body.setAttribute("data-printing", "")

  const cleanup = () => {
    document.body.removeAttribute("data-printing")
    root.remove()
    window.removeEventListener("afterprint", cleanup)
  }
  window.addEventListener("afterprint", cleanup)
  window.print()
  // Respaldo por si afterprint no dispara (algunos navegadores/Electron).
  setTimeout(cleanup, 3000)
}

export function printTicketViaOsDriver(input: TicketInput): void {
  printHtml(buildTicketHtml(input))
}
