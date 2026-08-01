const { contextBridge, ipcRenderer } = require("electron");

/**
 * Ponte exposta na página de emissão (/emitir/<token>). A página web chama
 * `window.mdiEmitter.printTicket(...)` e o cupom sai na hora na impressora
 * térmica configurada, sem diálogo de impressão.
 */
contextBridge.exposeInMainWorld("mdiEmitter", {
  isDesktop: true,
  printTicket: (ticket) => ipcRenderer.invoke("emitter:print-ticket", ticket),
  openSettings: () => ipcRenderer.invoke("emitter:open-settings"),
});