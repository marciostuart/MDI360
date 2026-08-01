const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mdiSettings", {
  load: () => ipcRenderer.invoke("settings:load"),
  listPrinters: () => ipcRenderer.invoke("settings:printers"),
  save: (config) => ipcRenderer.invoke("settings:save", config),
  testPrint: (config) => ipcRenderer.invoke("settings:test-print", config),
  pair: (config) => ipcRenderer.invoke("settings:pair", config),
  start: (config) => ipcRenderer.invoke("settings:start", config),
  quit: () => ipcRenderer.invoke("settings:quit"),
});