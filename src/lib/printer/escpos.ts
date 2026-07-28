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

const TICKET_WIDTH = 32

function centerLine(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length >= TICKET_WIDTH) return trimmed
  const pad = Math.floor((TICKET_WIDTH - trimmed.length) / 2)
  return " ".repeat(pad) + trimmed
}

/**
 * Devuelve el mismo contenido que `buildOrderTicket` pero como texto plano,
 * sin códigos ESC/POS. Útil para previews en pantalla.
 */
export function formatTicketAsText(input: TicketInput): string {
  const lines: string[] = []
  lines.push(centerLine(input.restaurantName.toUpperCase()))
  lines.push("-".repeat(TICKET_WIDTH))
  lines.push(`Mesa ${input.tableNumber}`)
  lines.push(`Pedido #${input.orderId}`)
  lines.push("-".repeat(TICKET_WIDTH))
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
}

function clpLine(label: string, amount: number | null): string {
  const value = amount != null ? `$${Math.round(amount).toLocaleString("es-CL")}` : "—"
  const pad = Math.max(1, TICKET_WIDTH - label.length - value.length)
  return label + " ".repeat(pad) + value
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Texto plano del comprobante (vista previa en pantalla, sin ESC/POS). */
export function formatReceiptAsText(input: ReceiptInput): string {
  const lines: string[] = []
  lines.push(centerLine(input.restaurantName.toUpperCase()))
  if (input.restaurantRut) lines.push(centerLine(`RUT ${input.restaurantRut}`))
  lines.push("-".repeat(TICKET_WIDTH))
  lines.push(centerLine(input.docLabel))
  if (input.folio != null) lines.push(centerLine(`N° ${input.folio}`))
  lines.push(centerLine(fmtFecha(input.emittedAt)))
  lines.push("-".repeat(TICKET_WIDTH))
  lines.push(clpLine("Neto", input.net))
  lines.push(clpLine("IVA", input.iva))
  lines.push(clpLine("TOTAL", input.total))
  lines.push("-".repeat(TICKET_WIDTH))
  lines.push(centerLine("Gracias por tu visita"))
  lines.push(centerLine("tumesaqr.com"))
  return lines.join("\n")
}

/** Comprobante de pago en ESC/POS, para la misma impresora térmica de cocina. */
export function buildReceiptTicket(input: ReceiptInput): Uint8Array {
  const lines: Uint8Array[] = [INIT]

  lines.push(ALIGN_CENTER, BOLD_ON, DOUBLE_HEIGHT_WIDTH)
  lines.push(encodeText(input.restaurantName), NEWLINE)
  lines.push(NORMAL_SIZE, BOLD_OFF)
  if (input.restaurantRut) lines.push(encodeText(`RUT ${input.restaurantRut}`), NEWLINE)

  lines.push(encodeText("--------------------------------"), NEWLINE)

  lines.push(BOLD_ON, encodeText(input.docLabel), NEWLINE, BOLD_OFF)
  if (input.folio != null) lines.push(encodeText(`N° ${input.folio}`), NEWLINE)
  lines.push(encodeText(fmtFecha(input.emittedAt)), NEWLINE)

  lines.push(encodeText("--------------------------------"), NEWLINE)

  lines.push(ALIGN_LEFT)
  lines.push(encodeText(clpLine("Neto", input.net)), NEWLINE)
  lines.push(encodeText(clpLine("IVA", input.iva)), NEWLINE)
  lines.push(BOLD_ON, encodeText(clpLine("TOTAL", input.total)), NEWLINE, BOLD_OFF)

  lines.push(encodeText("--------------------------------"), NEWLINE)
  lines.push(ALIGN_CENTER)
  lines.push(encodeText("Gracias por tu visita"), NEWLINE)
  lines.push(encodeText("tumesaqr.com"), NEWLINE)

  lines.push(NEWLINE, NEWLINE, NEWLINE, CUT)

  return concat(...lines)
}

export function buildOrderTicket(input: TicketInput): Uint8Array {
  const lines: Uint8Array[] = [INIT]

  lines.push(ALIGN_CENTER, BOLD_ON, DOUBLE_HEIGHT_WIDTH)
  lines.push(encodeText(input.restaurantName), NEWLINE)
  lines.push(NORMAL_SIZE, BOLD_OFF)

  lines.push(encodeText("--------------------------------"), NEWLINE)

  lines.push(BOLD_ON, encodeText(`Mesa ${input.tableNumber}`), NEWLINE, BOLD_OFF)
  lines.push(encodeText(`Pedido #${input.orderId}`), NEWLINE)

  lines.push(encodeText("--------------------------------"), NEWLINE)

  lines.push(ALIGN_LEFT)
  for (const item of input.items) {
    lines.push(encodeText(`${item.quantity}x  ${item.name}`), NEWLINE)
  }

  lines.push(NEWLINE, NEWLINE, NEWLINE, CUT)

  return concat(...lines)
}
