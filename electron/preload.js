// Puente seguro entre el proceso principal de Electron y la página web
// (contextIsolation:true en main.js exige esto — la página no puede usar
// Node/IPC directo, solo lo que se expone explícitamente aquí).
//
// Sirve para imprimir en SILENCIO desde la app de escritorio: a diferencia
// de window.print() (que SIEMPRE muestra el diálogo del sistema — los
// navegadores lo bloquean por seguridad, no hay forma de saltárselo desde
// la web), webContents.print({silent:true}) del proceso principal SÍ puede
// imprimir sin ningún diálogo a una impresora del sistema ya elegida.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  printSilently: (deviceName) => ipcRenderer.invoke('printer:print-silent', deviceName),
})
