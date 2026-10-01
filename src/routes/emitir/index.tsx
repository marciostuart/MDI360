import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Ticket } from "lucide-react";
import { useEffect, useState } from "react";

const TOKEN_KEY = "mdi360.emitterToken";

export const Route = createFileRoute("/emitir/")({
  head: () => ({
    meta: [
      { title: "Vincular terminal · MDI 360" },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#0b1220" },
    ],
  }),
  component: EmitterActivationPage,
});

function EmitterActivationPage() {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("Preparando este terminal...");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const schedule = (callback: () => void, delay = 2_000) => {
      timer = window.setTimeout(callback, delay);
    };

    const register = async () => {
      try {
        const response = await fetch("/api/public/emitter/register", { method: "POST" });
        if (!response.ok) throw new Error(`Servidor respondeu ${response.status}`);
        const data = (await response.json()) as {
          emitterToken: string;
          pairingCode: string;
        };
        if (cancelled) return;
        window.localStorage.setItem(TOKEN_KEY, data.emitterToken);
        setCode(data.pairingCode);
        setMessage("Informe este código no Studio. A conexão acontecerá automaticamente.");
        schedule(() => void checkStatus(data.emitterToken));
      } catch {
        if (cancelled) return;
        setMessage("Não foi possível conectar. Tentando novamente...");
        schedule(() => void register(), 5_000);
      }
    };

    const checkStatus = async (token: string) => {
      try {
        const response = await fetch("/api/public/emitter/status", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (response.status === 404 || response.status === 410) {
          window.localStorage.removeItem(TOKEN_KEY);
          setCode(null);
          await register();
          return;
        }
        if (!response.ok) throw new Error(`Servidor respondeu ${response.status}`);
        const data = (await response.json()) as {
          state: "waiting" | "linked";
          pairingCode?: string;
        };
        if (cancelled) return;
        if (data.state === "linked") {
          window.location.replace(`/emitir/${encodeURIComponent(token)}`);
          return;
        }
        setCode(data.pairingCode ?? null);
        setMessage("Informe este código no Studio. A conexão acontecerá automaticamente.");
        schedule(() => void checkStatus(token));
      } catch {
        if (cancelled) return;
        setMessage("Sem conexão com o servidor. Tentando novamente...");
        schedule(() => void checkStatus(token), 5_000);
      }
    };

    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (savedToken) void checkStatus(savedToken);
    else void register();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b1220] px-6 text-center text-white">
      <div className="w-full max-w-lg space-y-8">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Ticket className="size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold">Vincular terminal</h1>
          <p className="text-white/70">No Studio, abra Terminais e localize o terminal desejado.</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-8">
          {code ? (
            <p className="font-mono text-5xl font-black tracking-[0.28em] text-primary sm:text-6xl">
              {code}
            </p>
          ) : (
            <Loader2 className="mx-auto size-9 animate-spin text-primary" />
          )}
          <p className="mt-5 text-sm text-white/65">{message}</p>
        </div>
      </div>
    </main>
  );
}
