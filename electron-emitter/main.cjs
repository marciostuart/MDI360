"use strict";
const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { buildTicket, splitLines } = require("./escpos.cjs");
const { rawPrint } = require("./raw-print.cjs");

const DEFAULTS = {
  serverUrl: "https://mdi.360bh.com.br",
  token: "",
  pairingCode: "",
  printMode: "escpos",
  printerName: "",
  leftMarginDots: 0,
  printWidthDots: 576,
  topFeedLines: 1,
  bottomFeedLines: 4,
  cutMode: "partial",
  cutFeedDots: 40,
  labelSize: 5,
  headerText: "",
  footerText: "Obrigado pela preferencia",
  autoPrint: true,
  showWaitingAhead: false,
  pollSeconds: 2,
};

// Modo portatil: se existir portable.txt ao lado do executavel, a configuracao fica na propria pasta (pendrive).
function configPath() {
  const beside = path.join(path.dirname(app.getPath("exe")), "portable.txt");
  if (fs.existsSync(beside)) {
    return path.join(path.dirname(app.getPath("exe")), "mdi360-emissor.json");
  }
  return path.join(app.getPath("userData"), "config.json");
}

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(next) {
  const merged = { ...loadConfig(), ...next };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

let configWindow = null;
let monitorWindow = null;

/* ------------------------------------------------------------------ */
/* Estado do servico de impressao                                       */
/* ------------------------------------------------------------------ */
const state = {
  connected: false,
  panelName: "",
  pairingCode: "",
  message: "Aguardando configuração.",
  lastError: "",
  printed: 0,
  history: [],
};
/** ISO do ultimo cupom recebido: evita reimprimir senhas antigas. */
let sinceAt = null;
const printedIds = new Set();
let pollTimer = null;
let polling = false;

function pushStatus(patch) {
  Object.assign(state, patch);
  if (monitorWindow && !monitorWindow.isDestroyed()) {
    monitorWindow.webContents.send("status", state);
  }
}

function logTicket(entry) {
  state.history = [entry, ...state.history].slice(0, 40);
  pushStatus({ printed: state.printed });
}

/* ------------------------------------------------------------------ */
/* Janelas                                                             */
/* ------------------------------------------------------------------ */
function openMonitorWindow() {
  if (monitorWindow && !monitorWindow.isDestroyed()) {
    monitorWindow.show();
    monitorWindow.focus();
    return;
  }
  monitorWindow = new BrowserWindow({
    width: 780,
    height: 620,
    title: "MDI360 Impressor de Senhas",
    autoHideMenuBar: true,
    backgroundColor: "#0e1116",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  monitorWindow.loadFile(path.join(__dirname, "monitor.html"));
  monitorWindow.webContents.on("did-finish-load", () => pushStatus({}));
  monitorWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key).toLowerCase();
    if (key === "f10" || (input.control && input.shift && key === "c")) openConfigWindow();
  });
  monitorWindow.on("closed", () => {
    monitorWindow = null;
  });
}

function openConfigWindow() {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.show();
    configWindow.focus();
    return;
  }
  configWindow = new BrowserWindow({
    width: 900,
    height: 800,
    title: "MDI360 Impressor · Configuração",
    autoHideMenuBar: true,
    parent: monitorWindow ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  configWindow.loadFile(path.join(__dirname, "config.html"));
  configWindow.on("closed", () => {
    configWindow = null;
    if (!monitorWindow || monitorWindow.isDestroyed()) app.quit();
  });
}

async function listPrinters() {
  const win = configWindow ?? monitorWindow ?? new BrowserWindow({ show: false });
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, isDefault: p.isDefault, status: p.status }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Impressao                                                           */
/* ------------------------------------------------------------------ */
async function printTicket(payload) {
  const cfg = loadConfig();
  if (cfg.printMode === "driver") {
    // Alternativa: usa o driver do Windows (util quando a impressora nao aceita ESC/POS cru).
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    const html = `<html><head><meta charset="utf-8" /></head><body style="margin:${
      Math.max(cfg.topFeedLines, 0) * 4
    }px 0 ${Math.max(cfg.bottomFeedLines, 0) * 4}px;text-align:center;font-family:Arial"><div style="font-size:14px">${
      payload.sectorName ?? ""
    }</div><div style="font-size:12px">${
      payload.kind === "priority" ? "PREFERENCIAL" : "ATENDIMENTO NORMAL"
    }</div><div style="font-size:${cfg.labelSize * 14}px;font-weight:900">${
      payload.label
    }</div><div style="font-size:12px">${payload.issuedAt ?? ""}</div>${
      cfg.showWaitingAhead && typeof payload.waitingAhead === "number"
        ? `<div style="font-size:12px">${
            payload.waitingAhead === 0 ? "Você é o próximo" : `${payload.waitingAhead} pessoa(s) na frente`
          }</div>`
        : ""
    }${splitLines(cfg.footerText)
      .map((l) => `<div style="font-size:12px">${l}</div>`)
      .join("")}</body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: false,
          deviceName: cfg.printerName || undefined,
          margins: { marginType: "none" },
        },
        (ok, reason) => (ok ? resolve() : reject(new Error(reason || "Impressão cancelada."))),
      );
    });
    win.destroy();
    return { ok: true };
  }
  await rawPrint(cfg.printerName, buildTicket(payload, cfg));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Servico: escuta o servidor e imprime cada senha emitida             */
/* ------------------------------------------------------------------ */
async function poll() {
  if (polling) return;
  const cfg = loadConfig();
  if (!cfg.serverUrl) {
    pushStatus({ connected: false, message: "Informe o endereço do servidor em Configuração (F10)." });
    return;
  }

  polling = true;
  try {
    const base = cfg.serverUrl.replace(/\/+$/, "");

    // Como uma TV, o impressor se registra sozinho e recebe um código curto.
    if (!cfg.token) {
      const registerUrl = new URL(`${base}/api/public/emitter/register`);
      const registerRes = await fetch(registerUrl, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!registerRes.ok) {
        pushStatus({ connected: false, message: `Servidor respondeu ${registerRes.status}.` });
        return;
      }
      const registration = await registerRes.json();
      cfg.token = registration.emitterToken;
      cfg.pairingCode = registration.pairingCode;
      saveConfig(cfg);
    }

    const statusUrl = new URL(`${base}/api/public/emitter/status`);
    const statusRes = await fetch(statusUrl, {
      headers: { accept: "application/json", authorization: `Bearer ${cfg.token}` },
    });
    if (statusRes.status === 404 || statusRes.status === 410) {
      saveConfig({ token: "", pairingCode: "" });
      pushStatus({ connected: false, pairingCode: "", message: "Gerando um novo código..." });
      return;
    }
    if (!statusRes.ok) {
      pushStatus({ connected: false, message: `Servidor respondeu ${statusRes.status}.` });
      return;
    }
    const emitterStatus = await statusRes.json();
    if (emitterStatus.state === "waiting") {
      if (cfg.pairingCode !== emitterStatus.pairingCode) {
        cfg.pairingCode = emitterStatus.pairingCode;
        saveConfig(cfg);
      }
      pushStatus({
        connected: false,
        pairingCode: emitterStatus.pairingCode,
        panelName: "",
        message: "Informe este código em Studio → Senhas para vincular o terminal.",
        lastError: "",
      });
      return;
    }
    if (cfg.pairingCode) {
      cfg.pairingCode = "";
      saveConfig(cfg);
    }

    const url = new URL(`${base}/api/public/queue/print-spool`);

    url.searchParams.set("token", cfg.token);
    if (sinceAt) url.searchParams.set("since", sinceAt);

    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      pushStatus({
        connected: false,
        message:
          response.status === 404
            ? "Token não reconhecido pelo servidor."
            : `Servidor respondeu ${response.status}.`,
      });
      return;
    }
    const data = await response.json();
    const tickets = Array.isArray(data.tickets) ? data.tickets : [];
    pushStatus({
      connected: true,
      pairingCode: "",
      panelName: data.panelName ?? "",
      message: "Conectado. Aguardando novas senhas.",
      lastError: "",
    });

    // Primeira leitura apenas sincroniza o relogio: nao reimprime historico.
    if (!sinceAt) {
      sinceAt = data.serverTime ?? new Date().toISOString();
      return;
    }

    for (const ticket of tickets) {
      if (!ticket?.id || printedIds.has(ticket.id)) continue;
      printedIds.add(ticket.id);
      if (printedIds.size > 500) printedIds.delete(printedIds.values().next().value);
      if (ticket.issuedAt > (sinceAt ?? "")) sinceAt = ticket.issuedAt;
      if (!cfg.autoPrint) {
        logTicket({ label: ticket.label, at: new Date().toLocaleTimeString("pt-BR"), status: "Impressão desligada" });
        continue;
      }
      try {
        await printTicket({
          label: ticket.label,
          kind: ticket.kind ?? "normal",
          sectorName: ticket.sectorName ?? null,
          issuedAt: new Date(ticket.issuedAt).toLocaleString("pt-BR"),
          waitingAhead: typeof ticket.waitingAhead === "number" ? ticket.waitingAhead : null,
        });
        state.printed += 1;
        logTicket({ label: ticket.label, at: new Date().toLocaleTimeString("pt-BR"), status: "Impressa" });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logTicket({ label: ticket.label, at: new Date().toLocaleTimeString("pt-BR"), status: `Falhou: ${detail}` });
        pushStatus({ lastError: detail });
      }
    }
  } catch (error) {
    pushStatus({
      connected: false,
      message: "Sem conexão com o servidor. Tentando novamente...",
      lastError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    polling = false;
  }
}

function startService({ reset = false } = {}) {
  if (pollTimer) clearInterval(pollTimer);
  if (reset) {
    sinceAt = null;
    printedIds.clear();
  }
  const cfg = loadConfig();
  const seconds = Math.min(Math.max(Number(cfg.pollSeconds) || 2, 1), 30);
  void poll();
  pollTimer = setInterval(() => void poll(), seconds * 1000);
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */
ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:printers", () => listPrinters());
ipcMain.handle("config:save", (_e, next) => saveConfig(next));
ipcMain.handle("config:start", (_e, next) => {
  saveConfig(next);
  startService({ reset: true });
  if (configWindow && !configWindow.isDestroyed()) {
    const win = configWindow;
    configWindow = null;
    win.close();
  }
  openMonitorWindow();
  return { ok: true };
});
ipcMain.handle("config:open", () => openConfigWindow());
ipcMain.handle("status:get", () => state);
ipcMain.handle("print:ticket", async (_e, payload) => {
  try {
    return await printTicket(payload ?? {});
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("print:test", async (_e, next) => {
  if (next) saveConfig(next);
  try {
    await printTicket({
      label: "A001",
      kind: "normal",
      sectorName: "Teste de impressão",
      issuedAt: new Date().toLocaleString("pt-BR"),
      waitingAhead: 0,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("app:quit", () => app.quit());

app.whenReady().then(() => {
  const cfg = loadConfig();
  openMonitorWindow();
  startService({ reset: true });
  if (!cfg.printerName) openConfigWindow();

  globalShortcut.register("Control+Shift+C", () => openConfigWindow());
  globalShortcut.register("F10", () => openConfigWindow());
  globalShortcut.register("Control+Shift+Q", () => app.quit());
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  if (pollTimer) clearInterval(pollTimer);
  globalShortcut.unregisterAll();
});
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("MDI360 Impressor", String(error?.message ?? error));
});
