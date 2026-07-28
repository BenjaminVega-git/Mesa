/**
 * Fachada de transporte de la impresora térmica: Bluetooth (Web Bluetooth).
 * El resto de la app (página de impresora, boleta imprimible) trabaja
 * contra este tipo único en vez de conocer los detalles del transporte.
 *
 * La conexión por CABLE/USB (Web Serial) se eliminó: nunca se logró
 * confirmar que llegara a imprimir en el hardware real de un cliente
 * (varias rondas de troubleshooting — velocidad de baudios, etc.) y
 * generó un bug de impresión doble al convivir con la vía "impresora del
 * sistema" (osPrint.ts) que ya cubre ese mismo caso de uso de forma más
 * confiable. Ver src/lib/printer/osPrint.ts para el fallback universal.
 */
import {
  isWebBluetoothAvailable,
  requestPrinter as requestBluetoothPrinter,
  getKnownBluetoothPrinter,
  sendToPrinter as sendToBluetoothPrinter,
  type BluetoothPrinter,
} from "./bluetooth"

export { isWebBluetoothAvailable }

export type ConnectedPrinter = { transport: "bluetooth"; printer: BluetoothPrinter }

export async function connectBluetoothPrinter(preferredName?: string | null): Promise<ConnectedPrinter> {
  const printer = await requestBluetoothPrinter(preferredName)
  return { transport: "bluetooth", printer }
}

/** Reconecta en silencio al último dispositivo Bluetooth autorizado, sin pedir gesto del usuario. */
export async function getKnownPrinter(): Promise<ConnectedPrinter | null> {
  const bt = await getKnownBluetoothPrinter()
  return bt ? { transport: "bluetooth", printer: bt } : null
}

export async function sendTicket(connected: ConnectedPrinter, data: Uint8Array): Promise<void> {
  await sendToBluetoothPrinter(connected.printer, data)
}

export async function disconnectPrinter(connected: ConnectedPrinter): Promise<void> {
  if (connected.printer.device.gatt?.connected) connected.printer.device.gatt.disconnect()
}

export function printerLabel(connected: ConnectedPrinter): string {
  return connected.printer.device.name || "Impresora Bluetooth"
}

export function onPrinterDisconnected(connected: ConnectedPrinter, cb: () => void): void {
  connected.printer.device.addEventListener("gattserverdisconnected", cb)
}
