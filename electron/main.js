const { app, BrowserWindow, shell, Menu, session, dialog } = require('electron')

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

// ── Impresora térmica: Web Serial (cable) y Web Bluetooth ─────────────────
// A diferencia de un navegador normal, Electron NO tiene un selector nativo
// de dispositivos: sin estos handlers, navigator.serial.requestPort() y
// navigator.bluetooth.requestDevice() no muestran nada dentro del .exe (el
// picker de Chrome/Edge solo existe cuando hay "chrome" de navegador). Con
// un solo dispositivo conectado (el caso típico de un POS) se elige solo;
// con más de uno se pregunta por diálogo nativo.
function setupDeviceChoosers(ses) {
  ses.on('select-serial-port', async (event, portList, webContents, callback) => {
    event.preventDefault()
    if (portList.length === 0) {
      callback('')
      return
    }
    if (portList.length === 1) {
      callback(portList[0].portId)
      return
    }
    const win = BrowserWindow.fromWebContents(webContents) || mainWindow
    const labels = portList.map((p) => p.displayName || p.portName || p.portId)
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Elegir impresora',
        message: 'Hay varios dispositivos conectados por cable. ¿Cuál es la impresora?',
        buttons: [...labels, 'Cancelar'],
        cancelId: labels.length,
      })
      callback(response < labels.length ? portList[response].portId : '')
    } catch {
      callback('')
    }
  })

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

  // Permite que getPorts()/getDevices() reconecten en silencio a un
  // dispositivo ya elegido antes, sin repetir el selector cada vez.
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial')

  // App de un solo origen fijo (tumesaqr.com, con CSP + navegación bloqueada
  // a otros dominios): no hay contenido no confiable al que restringirle
  // permisos, así que se autoriza todo lo que pida (incluye 'serial' y
  // 'bluetooth', que sin esto el picker de arriba ni se dispara).
  ses.setPermissionCheckHandler(() => true)
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

  createWindow()
  setupAutoUpdates()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})