"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// Ponte usada pela tela de configuracao e pelo emissor web (/emitir/:token).
contextBridge.exposeInMainWorld("mdiEmitter", {
  isDesktop: true,
  version: "1.0.0",
  getConfig: () => ipcRenderer.invoke("config:get"),
  listPrinters: () => ipcRenderer.invoke("config:printers"),
  saveConfig: (cfg) => ipcRenderer.invoke("config:save", cfg),
  startKiosk: (cfg) => ipcRenderer.invoke("config:start", cfg),
  openConfig: () => ipcRenderer.invoke("config:open"),
  printTicket: (payload) => ipcRenderer.invoke("print:ticket", payload),
  testPrint: (cfg) => ipcRenderer.invoke("print:test", cfg),
  quit: () => ipcRenderer.invoke("app:quit"),
});
