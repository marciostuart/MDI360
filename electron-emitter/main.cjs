"use strict";
const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { buildTicket, splitLines } = require("./escpos.cjs");
const { rawPrint } = require("./raw-print.cjs");

const DEFAULTS = {
  serverUrl: "https://mdi.360bh.com.br",
  token: "",
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
let kioskWindow = null;

function openConfigWindow() {
  // Sai do modo kiosk e esconde o terminal para que a janela de configuracao apareca na frente.
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    try {
      kioskWindow.setKiosk(false);
      kioskWindow.setFullScreen(false);
      kioskWindow.setAlwaysOnTop(false);
      kioskWindow.hide();
    } catch {
      /* ignora */
    }
  }
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.show();
    configWindow.setAlwaysOnTop(true);
    configWindow.focus();
    return;
  }
  configWindow = new BrowserWindow({
    width: 900,
    height: 780,
    title: "MDI360 Emissor · Configuração",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  configWindow.loadFile(path.join(__dirname, "config.html"));
  configWindow.once("ready-to-show", () => {
    configWindow?.show();
    configWindow?.focus();
  });
  configWindow.on("closed", () => {
    configWindow = null;
    if (!kioskWindow || kioskWindow.isDestroyed()) {
      app.quit();
      return;
    }
    // Volta o terminal para tela cheia.
    try {
      kioskWindow.show();
      kioskWindow.setKiosk(true);
      kioskWindow.focus();
    } catch {
      /* ignora */
    }
  });
}

function openKioskWindow() {
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    kioskWindow.destroy();
    kioskWindow = null;
  }
  const cfg = loadConfig();
  const base = cfg.serverUrl.replace(/\/+$/, "");
  const url = `${base}/emitir/${encodeURIComponent(cfg.token)}`;

  kioskWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  kioskWindow.loadURL(url);
  // Gatilho de impressao independente da versao do site: observa as respostas de
  // emissao de senha na propria pagina e chama a ponte de impressao.
  kioskWindow.webContents.on("did-finish-load", () => {
    kioskWindow?.webContents
      .executeJavaScript(
        `(() => {
          if (window.__mdiPrintHook) return;
          window.__mdiPrintHook = true;
           const seen = new Map();
           const remember = (key) => {
             const now = Date.now();
             for (const [oldKey, at] of seen) if (now - at > 30000) seen.delete(oldKey);
             if (seen.has(key)) return false;
             seen.set(key, now);
             return true;
           };
          const maybePrint = (data) => {
            try {
               if (!data || typeof data !== "object") return false;
               const pending = [data];
               const visited = new Set();
               while (pending.length) {
                 const t = pending.shift();
                 if (!t || typeof t !== "object" || visited.has(t)) continue;
                 visited.add(t);
                 const label = t.label;
                 const isTicket = typeof label === "string" && label.length > 0 &&
                   (typeof t.waitingAhead === "number" || typeof t.number === "number" || typeof t.kind === "string");
                 if (isTicket) {
                   const key = label + "|" + (t.ticketId ?? t.id ?? "") + "|" + (t.sectorName ?? "");
                   if (!remember(key)) return true;
                   window.mdiEmitter?.printTicket?.({
                     label,
                     kind: t.kind ?? "normal",
                     sectorName: t.sectorName ?? null,
                     issuedAt: new Date().toLocaleString("pt-BR"),
                     waitingAhead: typeof t.waitingAhead === "number" ? t.waitingAhead : null,
                   });
                   return true;
                 }
                 for (const value of Object.values(t)) {
                   if (value && typeof value === "object") pending.push(value);
                 }
               }
               return false;
            } catch (_) {}
             return false;
          };
          const scan = (text) => {
             if (!text || (text.indexOf('label') === -1 && text.indexOf('waitingAhead') === -1)) return;
             try { if (maybePrint(JSON.parse(text))) return; } catch (_) {}
             // TanStack pode transportar o resultado serializado, com aspas escapadas.
             try {
               const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
               const label = unescaped.match(/"label"\s*:\s*"([^"\\]+)"/)?.[1];
               if (!label) return;
               const kind = unescaped.match(/"kind"\s*:\s*"([^"\\]+)"/)?.[1] ?? "normal";
               const sectorName = unescaped.match(/"sectorName"\s*:\s*(?:"([^"\\]*)"|null)/)?.[1] ?? null;
               const waiting = unescaped.match(/"waitingAhead"\s*:\s*(\d+)/)?.[1];
               const id = unescaped.match(/"id"\s*:\s*"([^"\\]+)"/)?.[1] ?? "";
               const key = label + "|" + id + "|" + (sectorName ?? "");
               if (!remember(key)) return;
               window.mdiEmitter?.printTicket?.({
                 label, kind, sectorName,
                 issuedAt: new Date().toLocaleString("pt-BR"),
                 waitingAhead: waiting == null ? null : Number(waiting),
               });
             } catch (_) {}
          };
          const originalFetch = window.fetch;
          window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
               // Server Functions usam URLs internas por hash; por isso o corpo, e não a URL,
               // identifica com segurança a resposta de emissão.
               response.clone().text().then(scan).catch(() => {});
            } catch (_) {}
            return response;
          };
          const open = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function (...args) {
            this.addEventListener("load", () => { try { scan(this.responseText); } catch (_) {} });
            return open.apply(this, args);
          };
        })();`,
      )
      .catch(() => {});
  });
  // Atalhos locais: funcionam mesmo quando o atalho global e' bloqueado pelo Windows.
  kioskWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key).toLowerCase();
    if (key === "f10" || (input.control && input.shift && key === "c")) openConfigWindow();
    if (input.control && input.shift && key === "q") app.quit();
  });
  kioskWindow.webContents.on("did-fail-load", (_e, _code, description) => {
    kioskWindow?.webContents.executeJavaScript(
      `document.body.innerHTML = '<div style="font:600 22px system-ui;color:#fff;background:#111;height:100vh;display:grid;place-items:center;text-align:center;padding:32px">Sem conexão com o servidor.<br><small style="font-weight:400">${String(
        description,
      ).replace(/'/g, "")} · F10 ou Ctrl+Shift+C para configurar</small></div>'`,
    );
  });
  kioskWindow.on("closed", () => {
    kioskWindow = null;
  });
}

async function listPrinters() {
  const win = configWindow ?? kioskWindow ?? new BrowserWindow({ show: false });
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, isDefault: p.isDefault, status: p.status }));
  } catch {
    return [];
  }
}

let lastPrint = { key: "", at: 0 };

async function printTicket(payload) {
  const cfg = loadConfig();
  if (!cfg.autoPrint) return { ok: true, skipped: true };
  // Evita imprimir duas vezes a mesma senha (site + gatilho local).
  const key = `${payload.label ?? ""}|${payload.sectorName ?? ""}`;
  if (key !== "|" && lastPrint.key === key && Date.now() - lastPrint.at < 8000) {
    return { ok: true, skipped: true };
  }
  lastPrint = { key, at: Date.now() };
  if (cfg.printMode === "driver") {
    // Alternativa: usa o driver do Windows (util quando a impressora nao aceita ESC/POS cru).
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    const html = `<html><head><meta charset="utf-8" /></head><body style="margin:0;padding:${
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
        { silent: true, printBackground: false, deviceName: cfg.printerName || undefined, margins: { marginType: "none" } },
        (ok, reason) => (ok ? resolve() : reject(new Error(reason || "Impressão cancelada."))),
      );
    });
    win.destroy();
    return { ok: true };
  }
  await rawPrint(cfg.printerName, buildTicket(payload, cfg));
  return { ok: true };
}

ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:printers", () => listPrinters());
ipcMain.handle("config:save", (_e, next) => saveConfig(next));
ipcMain.handle("config:start", (_e, next) => {
  saveConfig(next);
  openKioskWindow();
  if (configWindow && !configWindow.isDestroyed()) {
    const win = configWindow;
    configWindow = null;
    win.close();
  }
  return { ok: true };
});
ipcMain.handle("config:open", () => openConfigWindow());
ipcMain.handle("print:ticket", async (_e, payload) => {
  try {
    return await printTicket(payload ?? {});
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("print:test", async (_e, next) => {
  saveConfig(next);
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
  if (cfg.token) openKioskWindow();
  else openConfigWindow();

  globalShortcut.register("Control+Shift+C", () => openConfigWindow());
  globalShortcut.register("F10", () => openConfigWindow());
  globalShortcut.register("Control+Shift+Q", () => app.quit());
  globalShortcut.register("F5", () => kioskWindow?.reload());
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => globalShortcut.unregisterAll());
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("MDI360 Emissor", String(error?.message ?? error));
});
