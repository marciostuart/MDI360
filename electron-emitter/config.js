const fs = require("node:fs");
const path = require("node:path");

/**
 * Configuração do terminal. Em modo portátil (arquivo `portable.txt` ao lado
 * do .exe) o config fica junto do executável, permitindo rodar de um pendrive
 * sem instalar nada no computador do cliente.
 */
const DEFAULTS = {
  serverUrl: "",
  pairingCode: "",
  token: "",
  panelName: "",
  printerName: "",
  marginTopMm: 4,
  marginBottomMm: 8,
  marginLeftMm: 3,
  marginRightMm: 3,
  labelFontPx: 62,
  bodyFontPx: 12,
  widthMm: 80,
  autoCut: true,
  copies: 1,
};

function configDir(app) {
  const exeDir = path.dirname(app.getPath("exe"));
  if (fs.existsSync(path.join(exeDir, "portable.txt"))) return exeDir;
  try {
    fs.accessSync(exeDir, fs.constants.W_OK);
    if (fs.existsSync(path.join(exeDir, "mdi360-emissor.json"))) return exeDir;
  } catch {
    /* sem permissão de escrita: usa a pasta do usuário */
  }
  return app.getPath("userData");
}

function configFile(app) {
  return path.join(configDir(app), "mdi360-emissor.json");
}

function loadConfig(app) {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configFile(app), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(app, patch) {
  const next = { ...loadConfig(app), ...patch };
  fs.mkdirSync(path.dirname(configFile(app)), { recursive: true });
  fs.writeFileSync(configFile(app), JSON.stringify(next, null, 2), "utf8");
  return next;
}

module.exports = { DEFAULTS, loadConfig, saveConfig, configFile };