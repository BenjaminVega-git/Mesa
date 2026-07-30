// Puente expuesto por electron/preload.js — solo existe cuando la página
// corre dentro de la app de escritorio (window.electronAPI es undefined en
// cualquier navegador normal).
type ElectronPrinterInfo = { name: string; displayName: string; isDefault: boolean }
type ElectronPrintResult = { success: boolean; errorType?: string }

interface ElectronPrinterAPI {
  isElectron: true
  listPrinters: () => Promise<ElectronPrinterInfo[]>
  printSilently: (deviceName: string) => Promise<ElectronPrintResult>
  printHtmlSilently: (deviceName: string, html: string) => Promise<ElectronPrintResult>
  printRaw: (deviceName: string, bytes: number[]) => Promise<ElectronPrintResult>
}

declare global {
  interface Window {
    electronAPI?: ElectronPrinterAPI
  }
}

export {}
