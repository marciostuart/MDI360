type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export const EMITTER_TOKEN_KEY = "mdi360.emitterToken";
const CODE_KEY = "mdi360.emitterPairingCode";

export function isEmitterIdentityError(status: number, data: { code?: string }) {
  return (status === 404 && data.code === "EMITTER_UNKNOWN") ||
    (status === 410 && data.code === "EMITTER_EXPIRED");
}

/** One serialized polling chain. Transport/storage errors never create a new identity. */
export function startEmitterActivation(options: {
  fetch: typeof globalThis.fetch;
  storage: Storage;
  schedule: (task: () => void, delay: number) => () => void;
  onState: (code: string | null, message: string) => void;
  onLinked: (token: string) => void;
}) {
  let stopped = false;
  let cancelTimer: (() => void) | undefined;
  const abort = new AbortController();
  const read = (key: string) => { try { return options.storage.getItem(key); } catch { return null; } };
  const write = (key: string, value: string | null) => {
    try { if (value === null) options.storage.removeItem(key); else options.storage.setItem(key, value); } catch { /* In-memory identity survives disabled storage. */ }
  };
  let token = read(EMITTER_TOKEN_KEY);
  let code = read(CODE_KEY);
  const show = (message: string) => { if (!stopped) options.onState(code, message); };
  const later = (task: () => Promise<void>, delay = 2_000) => {
    if (stopped) return;
    cancelTimer?.();
    cancelTimer = options.schedule(() => { if (!stopped) void task(); }, delay);
  };
  const checkStatus = async () => {
    try {
      const response = await options.fetch("/api/public/emitter/status", {
        headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: abort.signal,
      });
      // A proxy's HTML 404/410 is not evidence that this terminal disappeared.
      const data = await response.json() as { code?: string; state?: string; pairingCode?: string };
      if (stopped) return;
      if (isEmitterIdentityError(response.status, data)) {
        token = null; code = null;
        write(EMITTER_TOKEN_KEY, null); write(CODE_KEY, null);
        show("Preparando este terminal...");
        later(register);
        return;
      }
      if (!response.ok) throw new Error("Status indisponível");
      if (data.state === "linked") { options.onLinked(token!); return; }
      if (data.state !== "waiting" || !data.pairingCode) throw new Error("Resposta incompleta");
      code = data.pairingCode;
      write(CODE_KEY, code);
      show("Informe este código no Studio. A conexão acontecerá automaticamente.");
      later(checkStatus);
    } catch {
      if (stopped) return;
      show("Sem conexão com o servidor. Tentando novamente...");
      later(checkStatus, 5_000);
    }
  };
  const register = async () => {
    try {
      const response = await options.fetch("/api/public/emitter/register", {
        method: "POST", cache: "no-store", signal: abort.signal,
        ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      });
      if (!response.ok) throw new Error("Cadastro indisponível");
      const data = await response.json() as { emitterToken?: string; pairingCode?: string };
      if (stopped) return;
      if (!data.emitterToken || !data.pairingCode) throw new Error("Resposta incompleta");
      token = data.emitterToken; code = data.pairingCode;
      write(EMITTER_TOKEN_KEY, token); write(CODE_KEY, code);
      show("Informe este código no Studio. A conexão acontecerá automaticamente.");
      later(checkStatus);
    } catch {
      if (stopped) return;
      show("Não foi possível conectar. Tentando novamente...");
      later(register, 5_000);
    }
  };
  show("Preparando este terminal...");
  if (token) void checkStatus(); else void register();
  return () => { stopped = true; cancelTimer?.(); abort.abort(); };
}
