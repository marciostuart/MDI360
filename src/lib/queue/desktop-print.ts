/**
 * Ponte com o app MDI 360 Emissor (Windows). O app injeta `window.mdiEmitter`
 * e imprime o cupom direto na impressora térmica configurada, sem diálogo do
 * navegador. No navegador comum a ponte não existe e a página segue usando a
 * impressão normal.
 */
export type DesktopTicket = {
  label: string;
  kind: string;
  sectorName: string | null;
  waitingAhead: number;
  panelName: string;
  issuedAt: string;
};

type EmitterBridge = {
  printTicket: (ticket: DesktopTicket) => void | Promise<unknown>;
  openSettings?: () => void;
};

function bridge(): EmitterBridge | null {
  if (typeof window === "undefined") return null;
  const value = (window as unknown as { mdiEmitter?: EmitterBridge }).mdiEmitter;
  return value && typeof value.printTicket === "function" ? value : null;
}

export function isDesktopEmitter() {
  return bridge() !== null;
}

/** Retorna true quando o app desktop assumiu a impressão. */
export function printTicketOnDesktop(ticket: DesktopTicket) {
  const api = bridge();
  if (!api) return false;
  void api.printTicket(ticket);
  return true;
}