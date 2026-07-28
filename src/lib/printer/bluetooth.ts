/// <reference types="web-bluetooth" />
/**
 * Web Bluetooth para impresoras térmicas ESC/POS.
 *
 * La mayoría de impresoras 58mm/80mm chinas (POS-58, MTP-II, RPP02N, GOOJPRT)
 * exponen su característica writable bajo uno de varios servicios conocidos.
 * Hacemos descubrimiento adaptativo: declaramos todos los servicios posibles
 * en `optionalServices` y elegimos el primero que tenga una característica
 * escribible.
 *
 * IMPORTANTE: cada servicio que se intente con getPrimaryService() DEBE estar
 * declarado en optionalServices del requestDevice(), o el navegador lo bloquea.
 */

// Todos los servicios que vamos a intentar. Mismo array para optionalServices
// y para el loop de descubrimiento — así nunca se desincronizan.
const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // POS-58, MTP-II, GOOJPRT, RPP02N
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 / FFE0-FFE1 (muy común)
  "0000ff00-0000-1000-8000-00805f9b34fb", // algunos clones
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip / ISSC
]

const CHUNK_SIZE = 100 // BLE: MTU 23 (20 payload). Chrome negocia más; 100 es seguro.
const CHUNK_DELAY_MS = 30 // delay entre paquetes para no saturar el buffer del printer.

export type BluetoothPrinter = {
  device: BluetoothDevice
  characteristic: BluetoothRemoteGATTCharacteristic
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.bluetooth)
}

export async function requestPrinter(preferredName?: string | null): Promise<BluetoothPrinter> {
  if (!isWebBluetoothAvailable()) {
    throw new Error("Tu navegador no soporta Web Bluetooth. Usá Chrome o Edge en escritorio o Android.")
  }

  // No se pueden pasar `filters` y `acceptAllDevices` a la vez: la spec lo prohíbe.
  // Construimos el objeto condicionalmente.
  const name = preferredName?.trim()
  const options: RequestDeviceOptions = name
    ? { filters: [{ namePrefix: name }], optionalServices: PRINTER_SERVICES }
    : { acceptAllDevices: true, optionalServices: PRINTER_SERVICES }

  const device = await navigator.bluetooth.requestDevice(options)

  return connectToDevice(device)
}

/**
 * Reconexión silenciosa a un dispositivo YA emparejado antes (sin abrir el
 * selector del navegador ni pedir gesto del usuario) — para imprimir boletas
 * desde otra pantalla sin volver a /admin/printer a reemparejar.
 */
export async function getKnownBluetoothPrinter(): Promise<BluetoothPrinter | null> {
  if (!isWebBluetoothAvailable() || !navigator.bluetooth.getDevices) return null
  try {
    const devices = await navigator.bluetooth.getDevices()
    for (const device of devices) {
      try {
        return await connectToDevice(device)
      } catch {
        // probar el siguiente dispositivo ya emparejado
      }
    }
  } catch {
    // getDevices puede no estar disponible en todos los navegadores
  }
  return null
}

async function connectToDevice(device: BluetoothDevice): Promise<BluetoothPrinter> {
  if (!device.gatt) throw new Error("El dispositivo no expone GATT.")

  // Si ya está conectado (p. ej. al reemparejar), reusamos el server.
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect()

  for (const service of PRINTER_SERVICES) {
    try {
      const gattService = await server.getPrimaryService(service)
      const chars = await gattService.getCharacteristics()
      const writable = chars.find(
        (c) => c.properties.write || c.properties.writeWithoutResponse
      )
      if (writable) return { device, characteristic: writable }
    } catch {
      // Este servicio no existe en el dispositivo; probamos el siguiente.
    }
  }

  throw new Error("No se encontró una característica writable. ¿Es una impresora compatible?")
}

export async function sendToPrinter(printer: BluetoothPrinter, data: Uint8Array): Promise<void> {
  const char = printer.characteristic
  const useWithoutResponse = char.properties.writeWithoutResponse
  const write = useWithoutResponse
    ? char.writeValueWithoutResponse.bind(char)
    : char.writeValue.bind(char)

  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    const chunk = data.slice(offset, offset + CHUNK_SIZE)
    await write(chunk)
    if (useWithoutResponse) await wait(CHUNK_DELAY_MS)
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}