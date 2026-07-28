/**
 * Fachada de transporte de la impresora térmica: Bluetooth (siempre existió)
 * o CABLE/USB vía Web Serial (nuevo). El resto de la app (página de
 * impresora, boleta imprimible) trabaja contra este tipo único en vez de
 * conocer los detalles de cada transporte.
 */
import {
  isWebBluetoothAvailable,
  requestPrinter as requestBluetoothPrinter,
  getKnownBluetoothPrinter,
  sendToPrinter as sendToBluetoothPrinter,
  type BluetoothPrinter,
} from "./bluetooth"
import {
  isWebSerialAvailable,
  requestSerialPrinter,
  getKnownSerialPrinter,
  sendToSerialPrinter,
  disconnectSerialPrinter,
  COMMON_BAUD_RATES,
  getStoredBaudRate,
  setStoredBaudRate,
  type SerialPrinter,
} from "./serial"

export { isWebBluetoothAvailable, isWebSerialAvailable, COMMON_BAUD_RATES, getStoredBaudRate, setStoredBaudRate }

export type ConnectedPrinter =
  | { transport: "bluetooth"; printer: BluetoothPrinter }
  | { transport: "serial"; printer: SerialPrinter }

export async function connectBluetoothPrinter(preferredName?: string | null): Promise<ConnectedPrinter> {
  const printer = await requestBluetoothPrinter(preferredName)
  return { transport: "bluetooth", printer }
}

export async function connectSerialPrinter(baudRate?: number): Promise<ConnectedPrinter> {
  const printer = await requestSerialPrinter(baudRate)
  return { transport: "serial", printer }
}

/** Reconecta en silencio a lo último autorizado (Bluetooth o cable), sin pedir gesto del usuario. */
export async function getKnownPrinter(): Promise<ConnectedPrinter | null> {
  const bt = await getKnownBluetoothPrinter()
  if (bt) return { transport: "bluetooth", printer: bt }

  const serial = await getKnownSerialPrinter()
  if (serial) return { transport: "serial", printer: serial }

  return null
}

export async function sendTicket(connected: ConnectedPrinter, data: Uint8Array): Promise<void> {
  if (connected.transport === "bluetooth") await sendToBluetoothPrinter(connected.printer, data)
  else await sendToSerialPrinter(connected.printer, data)
}

export async function disconnectPrinter(connected: ConnectedPrinter): Promise<void> {
  if (connected.transport === "bluetooth") {
    if (connected.printer.device.gatt?.connected) connected.printer.device.gatt.disconnect()
  } else {
    await disconnectSerialPrinter(connected.printer)
  }
}

export function printerLabel(connected: ConnectedPrinter): string {
  return connected.transport === "bluetooth"
    ? connected.printer.device.name || "Impresora Bluetooth"
    : `${connected.printer.label} · ${connected.printer.baudRate} bps`
}

export function onPrinterDisconnected(connected: ConnectedPrinter, cb: () => void): void {
  if (connected.transport === "bluetooth") {
    connected.printer.device.addEventListener("gattserverdisconnected", cb)
  } else {
    connected.printer.port.addEventListener("disconnect", cb)
  }
}
