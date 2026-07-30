const { app, BrowserWindow, shell, Menu, session, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile } = require('child_process')

const BASE_URL = 'https://tumesaqr.com'
const APP_URL = `${BASE_URL}/admin`
const isDev = !app.isPackaged

// ── Auto-actualización del binario ─────────────────────────────────────────
// El CONTENIDO del panel siempre está al día (la app carga tumesaqr.com/admin
// en vivo). Esto actualiza el BINARIO: electron-updater consulta el último
// GitHub Release del repo (público, sin token), descarga el instalador en
// segundo plano y ofrece reiniciar. Corre solo empaquetado (no en dev).
function setupAutoUpdates() {
  if (isDev) return

  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch (err) {
    console.error('[updater] electron-updater no disponible:', err)
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    const win = BrowserWindow.getAllWindows()[0]
    const opts = {
      type: 'info',
      buttons: ['Reiniciar ahora', 'Después'],
      defaultId: 0,
      cancelId: 1,
      title: 'Actualización lista',
      message: `Hay una versión nueva de MESA (${info?.version ?? ''}).`,
      detail: 'Se descargó en segundo plano. Reiniciá la app para aplicarla; si elegís "Después", se instala sola al cerrar.',
    }
    const ask = win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
    ask.then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    }).catch(() => undefined)
  })

  autoUpdater.on('error', (err) => {
    // Sin red o release sin assets: silencioso, se reintenta en el próximo ciclo.
    console.error('[updater] error:', err?.message ?? err)
  })

  const check = () => autoUpdater.checkForUpdates().catch(() => undefined)
  check()
  setInterval(check, 4 * 60 * 60 * 1000) // cada 4 horas mientras esté abierta
}


const ALLOWED_ORIGIN = new URL(BASE_URL).origin

function isAllowedUrl(targetUrl) {
  try {
    return new URL(targetUrl).origin === ALLOWED_ORIGIN
  } catch {
    return false
  }
}

Menu.setApplicationMenu(null)

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:mesa',
      preload: path.join(__dirname, 'preload.js'),
    },
    show: true,
    backgroundColor: '#0c0a09',
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.setMenu(null)

  console.log(`[electron] Cargando ${APP_URL}`)
  mainWindow.loadURL(APP_URL).catch((err) => {
    console.error('[electron] Error cargando URL:', err)
  })

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[electron] did-fail-load (${code} ${description}) -> ${url}`)
    if (code === -102 || code === -106 || code === -105) {
      setTimeout(() => {
        console.log('[electron] Reintentando cargar...')
        mainWindow.loadURL(APP_URL).catch(() => undefined)
      }, 2000)
    }
  })

 
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
}

// ── Impresora térmica: Web Bluetooth ───────────────────────────────────────
// A diferencia de un navegador normal, Electron NO tiene un selector nativo
// de dispositivos: sin este handler, navigator.bluetooth.requestDevice() no
// muestra nada dentro del .exe (el picker de Chrome/Edge solo existe cuando
// hay "chrome" de navegador). Con un solo dispositivo cerca se elige solo;
// con más de uno se pregunta por diálogo nativo.
//
// La vía por cable (Web Serial) se eliminó del producto — ver
// src/lib/printer/index.ts — así que no hace falta 'select-serial-port'.
function setupDeviceChoosers(ses) {
  ses.on('select-bluetooth-device', async (event, deviceList, callback) => {
    event.preventDefault()
    if (deviceList.length === 0) {
      callback('')
      return
    }
    if (deviceList.length === 1) {
      callback(deviceList[0].deviceId)
      return
    }
    const win = mainWindow
    const labels = deviceList.map((d) => d.deviceName || d.deviceId)
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Elegir impresora',
        message: 'Hay varios dispositivos Bluetooth cerca. ¿Cuál es la impresora?',
        buttons: [...labels, 'Cancelar'],
        cancelId: labels.length,
      })
      callback(response < labels.length ? deviceList[response].deviceId : '')
    } catch {
      callback('')
    }
  })

  // App de un solo origen fijo (tumesaqr.com, con CSP + navegación bloqueada
  // a otros dominios): no hay contenido no confiable al que restringirle
  // permisos, así que se autoriza todo lo que pida ('bluetooth' incluido —
  // sin esto el picker de arriba ni se dispara).
  ses.setPermissionCheckHandler(() => true)
}

// ── Impresión SILENCIOSA (sin diálogo) desde la app de escritorio ─────────
// window.print() del navegador SIEMPRE muestra el diálogo del sistema — es
// una restricción de seguridad que ninguna página web puede evitar. Pero
// desde el PROCESO PRINCIPAL de Electron, webContents.print({silent:true})
// sí puede imprimir sin ningún diálogo a una impresora ya elegida. La página
// (vía preload.js → contextBridge) solo pide "imprimí esto en silencio";
// sigue siendo la página la que arma el contenido a imprimir (marcando
// data-print-root/data-printing, igual que ya hace osPrint.ts) — esto solo
// reemplaza el ÚLTIMO paso (window.print() → print({silent:true})).
function setupPrinterIpc() {
  ipcMain.handle('printer:list', async () => {
    if (!mainWindow) return []
    const printers = await mainWindow.webContents.getPrintersAsync()
    return printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: Boolean(p.isDefault) }))
  })

  ipcMain.handle('printer:print-silent', async (_event, deviceName) => {
    return new Promise((resolve) => {
      if (!mainWindow) {
        resolve({ success: false, errorType: 'Ventana no disponible' })
        return
      }
      mainWindow.webContents
        .executeJavaScript(
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
          true
        )
        .catch(() => undefined)
        .finally(() => {
          mainWindow.webContents.print(
            { silent: true, deviceName, printBackground: true, margins: { marginType: 'none' } },
            (success, errorType) => resolve({ success, errorType })
          )
      })
    })
  })

  ipcMain.handle('printer:print-html-silent', async (_event, deviceName, html) => {
    if (!mainWindow) return { success: false, errorType: 'Ventana no disponible' }
    if (typeof html !== 'string' || html.trim().length === 0) {
      return { success: false, errorType: 'Ticket vacío' }
    }
    if (html.length > 250000) {
      return { success: false, errorType: 'Ticket demasiado grande' }
    }

    let printWindow
    try {
      printWindow = new BrowserWindow({
        width: 384,
        height: 900,
        show: false,
        parent: mainWindow,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
        backgroundColor: '#ffffff',
      })

      const page = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @page { size: auto; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      background: #fff;
      color: #000;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    * {
      box-sizing: border-box;
    }
  </style>
</head>
<body>${html}</body>
</html>`

      const encoded = Buffer.from(page, 'utf8').toString('base64')
      await printWindow.loadURL(`data:text/html;base64,${encoded}`)
      await printWindow.webContents.executeJavaScript(
        "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        true
      )

      return await new Promise((resolve) => {
        printWindow.webContents.print(
          { silent: true, deviceName, printBackground: true, margins: { marginType: 'none' } },
          (success, errorType) => resolve({ success, errorType })
        )
      })
    } catch (err) {
      return { success: false, errorType: err?.message || 'La app de escritorio no pudo imprimir' }
    } finally {
      if (printWindow && !printWindow.isDestroyed()) printWindow.close()
    }
  })

  ipcMain.handle('printer:print-raw', async (_event, deviceName, bytes) => {
    if (process.platform !== 'win32') {
      return { success: false, errorType: 'La impresión silenciosa RAW solo está disponible en Windows' }
    }
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, errorType: 'Impresora no seleccionada' }
    }
    if (!Array.isArray(bytes) || bytes.length === 0) {
      return { success: false, errorType: 'Ticket vacío' }
    }
    if (bytes.length > 65536) {
      return { success: false, errorType: 'Ticket demasiado grande' }
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-raw-print-'))
    const binPath = path.join(dir, 'ticket.bin')
    const psPath = path.join(dir, 'print-raw.ps1')

    try {
      fs.writeFileSync(binPath, Buffer.from(bytes))
      fs.writeFileSync(psPath, `
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)

$source = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "No se pudo abrir la impresora");
    }
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "MESA ticket";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "No se pudo iniciar el documento");
      try {
        if (!StartPagePrinter(hPrinter)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "No se pudo iniciar la página");
        try {
          Int32 written;
          if (!WritePrinter(hPrinter, bytes, bytes.Length, out written) || written != bytes.Length) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "No se pudo escribir el ticket completo");
          }
        } finally {
          EndPagePrinter(hPrinter);
        }
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@

Add-Type -TypeDefinition $source
$rawBytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinterHelper]::SendBytesToPrinter($PrinterName, $rawBytes)
`, 'utf8')

      return await new Promise((resolve) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, '-PrinterName', deviceName, '-FilePath', binPath],
          { windowsHide: true, timeout: 30000 },
          (error, stdout, stderr) => {
            if (error) {
              resolve({ success: false, errorType: stderr?.trim() || stdout?.trim() || error.message })
            } else {
              resolve({ success: true })
            }
          }
        )
      })
    } catch (err) {
      return { success: false, errorType: err?.message || 'No se pudo imprimir RAW' }
    } finally {
      fs.rm(dir, { recursive: true, force: true }, () => undefined)
    }
  })
}

app.whenReady().then(() => {
  const ses = session.fromPartition('persist:mesa')

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self' " + BASE_URL,
            "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co https://images.pexels.com",
            "connect-src 'self' " + BASE_URL +
              " https://api.cloudinary.com https://*.supabase.co wss://*.supabase.co",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline'",
            "frame-ancestors 'none'",
          ].join('; '),
        ],
      },
    })
  })

  setupDeviceChoosers(ses)
  setupPrinterIpc()

  createWindow()
  setupAutoUpdates()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
