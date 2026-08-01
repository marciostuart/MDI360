const FIELDS = [
  "serverUrl",
  "pairingCode",
  "printerName",
  "widthMm",
  "marginTopMm",
  "marginBottomMm",
  "marginLeftMm",
  "marginRightMm",
  "labelFontPx",
  "bodyFontPx",
  "copies",
];
const NUMBERS = FIELDS.filter((field) => field.endsWith("Mm") || field.endsWith("Px") || field === "copies" || field === "widthMm");

const el = (id) => document.getElementById(id);
const status = el("status");
let current = {};

function say(message, ok = true) {
  status.textContent = message;
  status.className = ok ? "ok" : "err";
}

function readForm() {
  const values = {};
  for (const field of FIELDS) {
    const raw = el(field).value;
    values[field] = NUMBERS.includes(field) ? Number(raw) || 0 : String(raw).trim();
  }
  values.pairingCode = values.pairingCode.toUpperCase();
  values.autoCut = el("autoCut").checked;
  return values;
}

function fillForm(config) {
  for (const field of FIELDS) el(field).value = config[field] ?? "";
  el("autoCut").checked = Boolean(config.autoCut);
  el("paired").textContent = config.token
    ? `Vinculado a: ${config.panelName || "tela de emissão"}`
    : "Ainda não vinculado.";
}

async function loadPrinters(selected) {
  const printers = await window.mdiSettings.listPrinters();
  const select = el("printerName");
  select.innerHTML = "";
  if (printers.length === 0) {
    select.appendChild(new Option("Nenhuma impressora encontrada", ""));
    return;
  }
  for (const printer of printers) {
    const option = new Option(
      `${printer.displayName}${printer.isDefault ? " (padrão)" : ""}`,
      printer.name,
    );
    select.appendChild(option);
  }
  const fallback = printers.find((printer) => printer.isDefault) ?? printers[0];
  select.value = printers.some((printer) => printer.name === selected)
    ? selected
    : fallback.name;
}

async function init() {
  const { config, configPath, version } = await window.mdiSettings.load();
  current = config;
  fillForm(config);
  await loadPrinters(config.printerName);
  el("configPath").textContent = `v${version} · configuração em ${configPath}`;
}

el("refresh").addEventListener("click", async () => {
  await loadPrinters(readForm().printerName);
  say("Lista de impressoras atualizada.");
});

el("test").addEventListener("click", async () => {
  const config = readForm();
  if (!config.printerName) return say("Selecione a impressora primeiro.", false);
  say("Enviando cupom de teste...");
  const result = await window.mdiSettings.testPrint(config);
  say(result.ok ? "Cupom de teste enviado." : `Falha na impressão: ${result.message}`, result.ok);
});

el("pair").addEventListener("click", async () => {
  say("Vinculando...");
  const result = await window.mdiSettings.pair(readForm());
  if (!result.ok) return say(result.message, false);
  current = { ...current, token: result.token, panelName: result.panelName };
  el("paired").textContent = `Vinculado a: ${result.panelName || "tela de emissão"}`;
  say("Terminal vinculado com sucesso.");
});

el("start").addEventListener("click", async () => {
  say("Abrindo emissão...");
  const result = await window.mdiSettings.start(readForm());
  if (!result.ok) say(result.message, false);
});

el("quit").addEventListener("click", () => window.mdiSettings.quit());

void init();