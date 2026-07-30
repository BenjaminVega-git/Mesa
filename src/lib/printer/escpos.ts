const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

const INIT = new Uint8Array([ESC, 0x40])
const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01])
const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00])
const DOUBLE_HEIGHT_WIDTH = new Uint8Array([GS, 0x21, 0x11])
const NORMAL_SIZE = new Uint8Array([GS, 0x21, 0x00])
const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01])
const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00])
const CUT = new Uint8Array([GS, 0x56, 0x00])
const NEWLINE = new Uint8Array([LF])

function encodeText(text: string): Uint8Array {
  // Strip accents → ASCII porque la mayoría de impresoras térmicas
  // 58mm/80mm no soportan UTF-8 por defecto.
  const normalized = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
  return new TextEncoder().encode(normalized)
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export type TicketItem = {
  name: string
  quantity: number
}

export type TicketInput = {
  restaurantName: string
  tableNumber: number | string
  orderId: number
  items: TicketItem[]
}

// 32 columnas es el estándar de fuente A en 58mm; 80mm suele andar en 42-48.
// Sin esto fijo, un ticket armado para 58mm sale angosto y descentrado en una
// impresora de 80mm ("no se ajusta al tamaño del papel") — no hay forma
// confiable de auto-detectar el ancho real vía ESC/POS entre fabricantes, así
// que se deja como preferencia guardada (ver getStoredTicketWidth/setStoredTicketWidth).
export const DEFAULT_TICKET_WIDTH = 32
export const TICKET_WIDTH_OPTIONS = [
  { width: 32, label: "58mm (32 columnas)" },
  { width: 48, label: "80mm (48 columnas)" },
] as const

const TICKET_WIDTH_STORAGE_KEY = "mesa-printer-ticket-width"

export function getStoredTicketWidth(): number {
  try {
    const raw = localStorage.getItem(TICKET_WIDTH_STORAGE_KEY)
    const n = raw ? Number.parseInt(raw, 10) : NaN
    return TICKET_WIDTH_OPTIONS.some((o) => o.width === n) ? n : DEFAULT_TICKET_WIDTH
  } catch {
    return DEFAULT_TICKET_WIDTH
  }
}

export function setStoredTicketWidth(width: number): void {
  try {
    localStorage.setItem(TICKET_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // no crítico
  }
}

function centerLine(text: string, width: number): string {
  const trimmed = text.trim()
  if (trimmed.length >= width) return trimmed
  const pad = Math.floor((width - trimmed.length) / 2)
  return " ".repeat(pad) + trimmed
}

/**
 * Devuelve el mismo contenido que `buildOrderTicket` pero como texto plano,
 * sin códigos ESC/POS. Útil para previews en pantalla.
 */
export function formatTicketAsText(input: TicketInput, width: number = DEFAULT_TICKET_WIDTH): string {
  const lines: string[] = []
  lines.push(centerLine(input.restaurantName.toUpperCase(), width))
  lines.push("-".repeat(width))
  lines.push(`Mesa ${input.tableNumber}`)
  lines.push(`Pedido #${input.orderId}`)
  lines.push("-".repeat(width))
  for (const item of input.items) {
    lines.push(`${item.quantity}x  ${item.name}`)
  }
  return lines.join("\n")
}

export type ReceiptInput = {
  restaurantName: string
  restaurantRut: string
  /** "Comprobante de pago" / "Comprobante de pago (factura)" — ya resuelto, no el código SII. */
  docLabel: string
  folio: number | null
  emittedAt: string | null
  net: number | null
  iva: number | null
  total: number | null
  items?: TicketItem[]
}

function clpLine(label: string, amount: number | null, width: number): string {
  const value = amount != null ? `$${Math.round(amount).toLocaleString("es-CL")}` : "—"
  const pad = Math.max(1, width - label.length - value.length)
  return label + " ".repeat(pad) + value
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Texto plano del comprobante (vista previa en pantalla, sin ESC/POS). */
export function formatReceiptAsText(input: ReceiptInput, width: number = DEFAULT_TICKET_WIDTH): string {
  const lines: string[] = []
  lines.push(centerLine(input.restaurantName.toUpperCase(), width))
  if (input.restaurantRut) lines.push(centerLine(`RUT ${input.restaurantRut}`, width))
  lines.push("-".repeat(width))
  lines.push(centerLine(input.docLabel, width))
  if (input.folio != null) lines.push(centerLine(`N° ${input.folio}`, width))
  lines.push(centerLine(fmtFecha(input.emittedAt), width))
  lines.push("-".repeat(width))
  if (input.items && input.items.length > 0) {
    for (const item of input.items) {
      lines.push(`${item.quantity}x  ${item.name}`)
    }
    lines.push("-".repeat(width))
  }
  lines.push(clpLine("Neto", input.net, width))
  lines.push(clpLine("IVA", input.iva, width))
  lines.push(clpLine("TOTAL", input.total, width))
  lines.push("-".repeat(width))
  lines.push(centerLine("Gracias por tu visita", width))
  lines.push(centerLine("tumesaqr.com", width))
  return lines.join("\n")
}

/** Comprobante de pago en ESC/POS, para la misma impresora térmica de cocina. */
export function buildReceiptTicket(input: ReceiptInput, width: number = DEFAULT_TICKET_WIDTH): Uint8Array {
  const separator = encodeText("-".repeat(width))
  const lines: Uint8Array[] = [INIT]

  lines.push(ALIGN_CENTER, BOLD_ON, DOUBLE_HEIGHT_WIDTH)
  lines.push(encodeText(input.restaurantName), NEWLINE)
  lines.push(NORMAL_SIZE, BOLD_OFF)
  if (input.restaurantRut) lines.push(encodeText(`RUT ${input.restaurantRut}`), NEWLINE)

  lines.push(separator, NEWLINE)

  lines.push(BOLD_ON, encodeText(input.docLabel), NEWLINE, BOLD_OFF)
  if (input.folio != null) lines.push(encodeText(`N° ${input.folio}`), NEWLINE)
  lines.push(encodeText(fmtFecha(input.emittedAt)), NEWLINE)

  lines.push(separator, NEWLINE)

  lines.push(ALIGN_LEFT)
  if (input.items && input.items.length > 0) {
    for (const item of input.items) {
      lines.push(encodeText(`${item.quantity}x  ${item.name}`), NEWLINE)
    }
    lines.push(separator, NEWLINE)
  }
  lines.push(encodeText(clpLine("Neto", input.net, width)), NEWLINE)
  lines.push(encodeText(clpLine("IVA", input.iva, width)), NEWLINE)
  lines.push(BOLD_ON, encodeText(clpLine("TOTAL", input.total, width)), NEWLINE, BOLD_OFF)

  lines.push(separator, NEWLINE)
  lines.push(ALIGN_CENTER)
  lines.push(encodeText("Gracias por tu visita"), NEWLINE)
  lines.push(encodeText("tumesaqr.com"), NEWLINE)

  lines.push(NEWLINE, NEWLINE, NEWLINE, CUT)

  return concat(...lines)
}

export function buildOrderTicket(input: TicketInput, width: number = DEFAULT_TICKET_WIDTH): Uint8Array {
  const separator = encodeText("-".repeat(width))
  const lines: Uint8Array[] = [INIT]

  lines.push(ALIGN_CENTER, BOLD_ON, DOUBLE_HEIGHT_WIDTH)
  lines.push(encodeText(input.restaurantName), NEWLINE)
  lines.push(NORMAL_SIZE, BOLD_OFF)

  lines.push(separator, NEWLINE)

  lines.push(BOLD_ON, encodeText(`Mesa ${input.tableNumber}`), NEWLINE, BOLD_OFF)
  lines.push(encodeText(`Pedido #${input.orderId}`), NEWLINE)

  lines.push(separator, NEWLINE)

  lines.push(ALIGN_LEFT)
  for (const item of input.items) {
    lines.push(encodeText(`${item.quantity}x  ${item.name}`), NEWLINE)
  }

  lines.push(NEWLINE, NEWLINE, NEWLINE, CUT)

  return concat(...lines)
}
