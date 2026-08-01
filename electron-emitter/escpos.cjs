"use strict";
// Monta o cupom da senha em bytes ESC/POS (compativel com EPSON TM-T20).
const ESC = 0x1b;
const GS = 0x1d;

function textBytes(value) {
  // CP850 cobre os acentos usados em portugues na TM-T20 (pagina de codigo 2).
  return Buffer.from(String(value ?? ""), "latin1");
}

function buildTicket(payload, cfg) {
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const line = (value) => {
    chunks.push(textBytes(value));
    push(0x0a);
  };

  push(ESC, 0x40); // reset
  push(ESC, 0x74, 0x02); // code page CP850
  push(GS, 0x4c, (cfg.leftMarginDots ?? 0) & 0xff, ((cfg.leftMarginDots ?? 0) >> 8) & 0xff); // margem esquerda
  if (cfg.printWidthDots) {
    push(GS, 0x57, cfg.printWidthDots & 0xff, (cfg.printWidthDots >> 8) & 0xff); // largura da area de impressao
  }
  push(ESC, 0x61, 0x01); // centralizado

  for (let i = 0; i < (cfg.topFeedLines ?? 0); i += 1) push(0x0a);

  if (cfg.headerText) {
    push(ESC, 0x21, 0x08); // enfase
    line(cfg.headerText);
    push(ESC, 0x21, 0x00);
    push(0x0a);
  }

  if (payload.sectorName) {
    line(payload.sectorName);
  }
  line(payload.kind === "priority" ? "PREFERENCIAL" : "ATENDIMENTO NORMAL");
  push(0x0a);

  const size = Math.min(Math.max(cfg.labelSize ?? 4, 1), 8) - 1;
  push(GS, 0x21, (size << 4) | size); // largura+altura da senha
  line(payload.label);
  push(GS, 0x21, 0x00);
  push(0x0a);

  if (payload.issuedAt) line(payload.issuedAt);
  if (typeof payload.waitingAhead === "number") {
    line(
      payload.waitingAhead === 0
        ? "Voce e o proximo"
        : `${payload.waitingAhead} pessoa(s) na frente`,
    );
  }
  if (cfg.footerText) {
    push(0x0a);
    line(cfg.footerText);
  }

  for (let i = 0; i < (cfg.bottomFeedLines ?? 3); i += 1) push(0x0a);

  const cutFeed = Math.min(Math.max(cfg.cutFeedDots ?? 40, 0), 255);
  if (cfg.cutMode === "none") {
    // sem corte automatico
  } else if (cfg.cutMode === "full") {
    push(GS, 0x56, 0x41, cutFeed); // corte total apos avanco
  } else {
    push(GS, 0x56, 0x42, cutFeed); // corte parcial (padrao da guilhotina TM-T20)
  }

  return Buffer.concat(chunks);
}

module.exports = { buildTicket };
