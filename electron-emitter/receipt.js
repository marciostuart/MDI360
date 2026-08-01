/** Monta o HTML do cupom de 80mm conforme as margens/fontes configuradas. */
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

function receiptHtml(ticket, config) {
  const when = new Date(ticket.issuedAt || Date.now()).toLocaleString("pt-BR");
  const ahead =
    Number(ticket.waitingAhead) === 0
      ? "Você é o próximo a ser chamado"
      : `${Number(ticket.waitingAhead) || 0} pessoa(s) na sua frente`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Senha</title>
<style>
  @page { size: ${config.widthMm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: ${config.widthMm}mm;
    padding: ${config.marginTopMm}mm ${config.marginRightMm}mm ${config.marginBottomMm}mm ${config.marginLeftMm}mm;
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #000; text-align: center;
    font-size: ${config.bodyFontPx}px;
  }
  .place { font-size: ${config.bodyFontPx + 1}px; font-weight: 700; text-transform: uppercase; }
  .kind { font-size: ${config.bodyFontPx}px; margin-top: 2mm; letter-spacing: 1px; text-transform: uppercase; }
  .label { font-size: ${config.labelFontPx}px; font-weight: 900; line-height: 1; margin: 4mm 0; }
  .sector { font-size: ${Math.round(config.labelFontPx / 3)}px; font-weight: 700; margin-bottom: 3mm; }
  hr { border: 0; border-top: 1px dashed #000; margin: 4mm 0; }
</style></head><body>
  <div class="place">${escapeHtml(ticket.panelName)}</div>
  <div class="kind">${ticket.kind === "priority" ? "Atendimento preferencial" : "Senha de atendimento"}</div>
  <div class="label">${escapeHtml(ticket.label)}</div>
  ${ticket.sectorName ? `<div class="sector">${escapeHtml(ticket.sectorName)}</div>` : ""}
  <hr />
  <div>${escapeHtml(when)}</div>
  <div>${escapeHtml(ahead)}</div>
  <div>Aguarde a chamada no painel</div>
</body></html>`;
}

module.exports = { receiptHtml };