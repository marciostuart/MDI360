"use strict";
// Monta o cupom da senha em bytes ESC/POS (compativel com EPSON TM-T20).
const ESC = 0x1b;
const GS = 0x1d;

// A TM-T20 usa CP1252 (pagina de codigo 16) para acentos/cedilha do portugues,
// que coincide byte a byte com latin1 no JavaScript.
function textBytes(value) {
  return Buffer.from(String(value ?? ""), "latin1");
}

// Permite quebra de linha manual no rodape/cabecalho: Enter real, "\n" digitado ou "|".
function splitLines(value) {
  return String(value ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\|/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function buildTicket(payload, cfg) {
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const line = (value) => {
    chunks.push(textBytes(value));
    push(0x0a);
  };
  // Margens negativas: avanco reverso do papel (economia de bobina).
  const feed = (lines) => {
    const count = Math.trunc(Number(lines) || 0);
    if (count > 0) for (let i = 0; i < count; i += 1) push(0x0a);
    else if (count < 0) push(ESC, 0x65, Math.min(Math.abs(count), 255));
  };

  push(ESC, 0x40); // reset
  push(ESC, 0x74, 0x10); // code page CP1252 (acentos)
  const printWidth = Math.trunc(Number(cfg.printWidthDots) || 576);
  // A TM-T20 imprime 576 pontos em papel de 80 mm. Uma área antiga de 512 pontos
  // começando em x=0 ficava 32 pontos à esquerda; centralizamos a área configurada.
  const paperWidth = printWidth <= 384 ? 384 : 576;
  const configuredLeft = Math.max(0, Math.trunc(Number(cfg.leftMarginDots) || 0));
  const left = configuredLeft + Math.max(0, Math.floor((paperWidth - printWidth) / 2));
  push(GS, 0x4c, left & 0xff, (left >> 8) & 0xff);
  if (printWidth) {
    push(GS, 0x57, printWidth & 0xff, (printWidth >> 8) & 0xff);
  }
  push(ESC, 0x61, 0x01); // centralizado

  feed(cfg.topFeedLines ?? 0);

  for (const headerLine of splitLines(cfg.headerText)) {
    push(ESC, 0x21, 0x08); // enfase
    line(headerLine);
    push(ESC, 0x21, 0x00);
  }
  if (cfg.headerText) push(0x0a);

  if (payload.sectorName) line(payload.sectorName);
  line(payload.kind === "priority" ? "PREFERENCIAL" : "ATENDIMENTO NORMAL");
  push(0x0a);

  const size = Math.min(Math.max(cfg.labelSize ?? 4, 1), 8) - 1;
  push(GS, 0x21, (size << 4) | size);
  line(payload.label);
  push(GS, 0x21, 0x00);
  push(0x0a);

  if (payload.issuedAt) line(payload.issuedAt);
  if (cfg.showWaitingAhead && typeof payload.waitingAhead === "number") {
    line(
      payload.waitingAhead === 0
        ? "Você é o próximo"
        : `${payload.waitingAhead} pessoa(s) na frente`,
    );
  }
  const footerLines = splitLines(cfg.footerText);
  if (footerLines.length) {
    push(0x0a);
    for (const footerLine of footerLines) line(footerLine);
  }

  const bottom = Math.trunc(Number(cfg.bottomFeedLines ?? 3) || 0);
  feed(bottom);

  let cutFeed = Math.trunc(Number(cfg.cutFeedDots ?? 40) || 0);
  if (bottom < 0) cutFeed += bottom * 24; // margem negativa tambem encurta o avanco do corte
  cutFeed = Math.min(Math.max(cutFeed, 0), 255);
  if (cfg.cutMode === "none") {
    // sem corte automatico
  } else if (cfg.cutMode === "full") {
    push(GS, 0x56, 0x41, cutFeed);
  } else {
    push(GS, 0x56, 0x42, cutFeed);
  }

  return Buffer.concat(chunks);
}

module.exports = { buildTicket, splitLines };
