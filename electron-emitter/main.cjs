const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

const { DEFAULTS, loadConfig, saveConfig, configFile } = require("./config.js");
const { receiptHtml } = require("./receipt.js");
const { sendCut } = require("./cut.js");

let settingsWindow = null;
let terminalWindow = null;

function normalizeServerUrl(value) {
  const url = String(value || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 900,
    height: 780,
    title: "MDI 360 Emissor · Configuração",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-settings.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
    if (!terminalWindow) app.quit();
  });
}

/** Abre o painel de emissão em tela cheia, já vinculado pelo código. */
function createTerminalWindow(config) {
  const url = `${normalizeServerUrl(config.serverUrl)}/emitir/${config.token}`;
  terminalWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-terminal.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  terminalWindow.loadURL(url);
  // F10 volta para as configurações · Esc sai do modo quiosque.
  terminalWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F10") {
      event.preventDefault();
      openSettings();
    }
    if (input.key === "Escape") terminalWindow?.setKiosk(false);
  });
  terminalWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: "deny" };
  });
  terminalWindow.on("closed", () => {
    terminalWindow = null;
    if (!settingsWindow) app.quit();
  });
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  createSettingsWindow();
}

/** Impressão silenciosa: renderiza o cupom fora da tela e manda pro spooler. */
async function printReceipt(ticket, config) {
  const worker = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    const html = receiptHtml(ticket, config);
    await worker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      worker.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: config.printerName || undefined,
          copies: Math.max(1, Number(config.copies) || 1),
          margins: { marginType: "none" },
          pageSize: {
            width: Math.round(Number(config.widthMm) * 1000),
            height: Math.round(Number(config.widthMm) * 2400),
          },
        },
        (success, reason) => (success ? resolve(true) : reject(new Error(reason || "print failed"))),
      );
    });
    if (config.autoCut) await sendCut(config.printerName);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error && error.message ? error.message : error) };
  } finally {
    worker.destroy();
  }
}

/** Troca o código curto pelo token da tela de emissão no servidor MDI 360. */
async function pair(config) {
  const server = normalizeServerUrl(config.serverUrl);
  if (!server) return { ok: false, message: "Informe o endereço do servidor." };
  const code = String(config.pairingCode || "").trim().toUpperCase();
  if (!code) return { ok: false, message: "Informe o código de vinculação." };
  try {
    const response = await fetch(`${server}/api/public/emitter/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok) {
      return { ok: false, message: (data && data.message) || "Não foi possível vincular." };
    }
    return { ok: true, token: data.token, panelName: data.panelName };
  } catch {
    return { ok: false, message: "Servidor inacessível. Confira a internet e o endereço." };
  }
}

ipcMain.handle("settings:load", () => ({
  config: loadConfig(app),
  defaults: DEFAULTS,
  configPath: configFile(app),
  version: app.getVersion(),
}));

ipcMain.handle("settings:printers", async () => {
  const window = settingsWindow ?? terminalWindow;
  if (!window) return [];
  const printers = await window.webContents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: printer.isDefault,
    status: printer.status,
  }));
});

ipcMain.handle("settings:save", (_event, config) => saveConfig(app, config));

ipcMain.handle("settings:test-print", async (_event, config) => {
  const merged = { ...loadConfig(app), ...config };
  return printReceipt(
    {
      label: merged.panelName ? "A001" : "001",
      kind: "normal",
      sectorName: "Teste de impressão",
      waitingAhead: 0,
      panelName: merged.panelName || "MDI 360 Emissor",
      issuedAt: new Date().toISOString(),
    },
    merged,
  );
});

ipcMain.handle("settings:pair", async (_event, config) => {
  const result = await pair({ ...loadConfig(app), ...config });
  if (result.ok) {
    saveConfig(app, {
      ...config,
      token: result.token,
      panelName: result.panelName,
    });
  }
  return result;
});

ipcMain.handle("settings:start", async (_event, config) => {
  let merged = saveConfig(app, config);
  if (!merged.token) {
    const result = await pair(merged);
    if (!result.ok) return result;
    merged = saveConfig(app, { token: result.token, panelName: result.panelName });
  }
  if (!merged.printerName) return { ok: false, message: "Selecione a impressora térmica." };

  if (terminalWindow) {
    terminalWindow.close();
    terminalWindow = null;
  }
  createTerminalWindow(merged);
  if (settingsWindow) {
    settingsWindow.close();
    settingsWindow = null;
  }
  return { ok: true };
});

ipcMain.handle("settings:quit", () => app.quit());

ipcMain.handle("emitter:print-ticket", async (_event, ticket) =>
  printReceipt(ticket ?? {}, loadConfig(app)),
);
ipcMain.handle("emitter:open-settings", () => openSettings());

// Uma única instância: evita dois terminais disputando a impressora.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openSettings());
  app.whenReady().then(() => {
    // O app SEMPRE abre na tela de configuração, como pedido.
    createSettingsWindow();
  });
  app.on("window-all-closed", () => app.quit());
}