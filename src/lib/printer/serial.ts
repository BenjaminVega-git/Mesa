/**
 * Web Serial para impresoras térmicas ESC/POS conectadas por CABLE (USB).
 * Misma arquitectura que bluetooth.ts (API del navegador, sin plugin nativo):
 * funciona en Chrome/Edge de escritorio o Android; no soportado en Safari/iOS
 * (el WKWebView de una app Capacitor tampoco lo expone).
 *
 * La mayoría de impresoras térmicas USB (o adaptadores USB-a-serial) ESC/POS
 * hablan a 9600 baudios; si una impresora no responde, ese es el primer
 * parámetro a revisar.
 */

// No hay paquete de tipos @types/web-serial instalado (a diferencia de
// @types/web-bluetooth); se declara el subconjunto mínimo que se usa.
declare global {
  interface SerialPort {
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<Uint8Array> | null
    open(options: { baudRate: number }): Promise<void>
    close(): Promise<void>
    getInfo(): { usbVendorId?: number; usbProductId?: number }
    addEventListener(type: "disconnect", listener: () => void): void
    removeEventListener(type: "disconnect", listener: () => void): void
  }
  interface Serial extends EventTarget {
    requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }
  interface Navigator {
    serial?: Serial
  }
}

const BAUD_RATE = 9600

// Chips USB-a-serie más comunes en impresoras térmicas/adaptadores baratos —
// para mostrar algo reconocible ("¿es este el que conecté?") en vez de un
// genérico "Impresora por cable". Si el VID no está en esta lista, se muestra
// igual el VID:PID crudo (sigue siendo información verificable).
const KNOWN_USB_SERIAL_VENDORS: Record<number, string> = {
  0x1a86: "CH340/CH341",
  0x0403: "FTDI",
  0x067b: "Prolific PL2303",
  0x10c4: "Silicon Labs CP210x",
  0x1a2c: "QinHeng",
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0")
}

/** Etiqueta identificable del puerto para que el usuario pueda verificar que es el dispositivo correcto. */
export function describeSerialPort(port: SerialPort): string {
  const info = port.getInfo()
  if (info.usbVendorId == null) return "Cable USB"
  const vendor = KNOWN_USB_SERIAL_VENDORS[info.usbVendorId]
  const ids = `VID ${hex4(info.usbVendorId)}${info.usbProductId != null ? `:PID ${hex4(info.usbProductId)}` : ""}`
  return vendor ? `Cable USB (${vendor} · ${ids})` : `Cable USB (${ids})`
}

export type SerialPrinter = {
  port: SerialPort
  writer: WritableStreamDefaultWriter<Uint8Array>
  label: string
}

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.serial)
}

async function connectToPort(port: SerialPort): Promise<SerialPrinter> {
  await port.open({ baudRate: BAUD_RATE })
  if (!port.writable) throw new Error("El puerto no permite escritura.")
  const writer = port.writable.getWriter()
  return { port, writer, label: describeSerialPort(port) }
}

export async function requestSerialPrinter(): Promise<SerialPrinter> {
  if (!isWebSerialAvailable()) {
    throw new Error("Tu navegador no soporta conexión por cable (Web Serial). Usá Chrome o Edge en escritorio o Android.")
  }
  const port = await navigator.serial!.requestPort()
  return connectToPort(port)
}

/** Reconexión silenciosa a un puerto ya autorizado antes, sin abrir el selector. */
export async function getKnownSerialPrinter(): Promise<SerialPrinter | null> {
  if (!isWebSerialAvailable()) return null
  try {
    const ports = await navigator.serial!.getPorts()
    for (const port of ports) {
      try {
        return await connectToPort(port)
      } catch {
        // probar el siguiente puerto ya autorizado
      }
    }
  } catch {
    // getPorts no debería fallar si isWebSerialAvailable() es true, pero por si acaso
  }
  return null
}

export async function sendToSerialPrinter(printer: SerialPrinter, data: Uint8Array): Promise<void> {
  await printer.writer.write(data)
}

export async function disconnectSerialPrinter(printer: SerialPrinter): Promise<void> {
  try {
    await printer.writer.close()
  } catch {
    // puede ya estar cerrado (p. ej. tras un "disconnect" del sistema)
  }
  try {
    await printer.port.close()
  } catch {
    // idem
  }
}
