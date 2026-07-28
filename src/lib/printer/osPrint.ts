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
 * Reusa el mismo patrón que src/components/dte/DocumentActions.tsx (marca
 * data-printing en <body> + data-print-root en el elemento a imprimir; la
 * regla @media print ya existe en globals.css) en vez de un elemento
 * siempre montado en el árbol de React.
 */
export function printTicketViaOsDriver(ticketText: string): void {
  if (typeof window === "undefined") return

  const root = document.createElement("div")
  root.setAttribute("data-print-root", "")
  root.style.cssText = "position:fixed;top:0;left:0;width:58mm;padding:2mm;background:#fff;"

  const pre = document.createElement("pre")
  pre.style.cssText =
    "font-family:'Courier New',monospace;font-size:12px;line-height:1.35;white-space:pre-wrap;margin:0;color:#000;"
  pre.textContent = ticketText
  root.appendChild(pre)

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
