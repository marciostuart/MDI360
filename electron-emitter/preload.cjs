"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// Ponte usada pelo monitor e pela tela de configuracao do impressor.
contextBridge.exposeInMainWorld("mdiEmitter", {
  isDesktop: true,
  version: "2.0.0",
  getConfig: () => ipcRenderer.invoke("config:get"),
  listPrinters: () => ipcRenderer.invoke("config:printers"),
  saveConfig: (cfg) => ipcRenderer.invoke("config:save", cfg),
  startService: (cfg) => ipcRenderer.invoke("config:start", cfg),
  openConfig: () => ipcRenderer.invoke("config:open"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  onStatus: (callback) => ipcRenderer.on("status", (_e, status) => callback(status)),
  printTicket: (payload) => ipcRenderer.invoke("print:ticket", payload),
  testPrint: (cfg) => ipcRenderer.invoke("print:test", cfg),
  quit: () => ipcRenderer.invoke("app:quit"),
});
