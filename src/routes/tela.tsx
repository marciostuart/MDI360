import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

type PlayerItem = {
  id: string;
  kind: "image" | "video" | "web";
  url: string;
  durationMs: number;
  isMuted: boolean;
  name: string;
};

type SyncResponse = {
  device: { id: string; name: string; canvasPreset: string };
  playlist: { id: string; name: string; revision: number; items: PlayerItem[] } | null;
  commands: string[];
  syncIntervalMs: number;
};

const TOKEN_KEY = "mdi360.deviceToken";
const APP_VERSION = "web-1.0.0";

export const Route = createFileRoute("/tela")({
  head: () => ({
    meta: [
      { title: "Player | MDI 360" },
      { name: "description", content: "Player de exibição para TVs e totens do MDI 360." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Player MDI 360" },
      { property: "og:description", content: "Player de exibição para TVs e totens." },
    ],
  }),
  component: PlayerScreen,
});

function PlayerScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<number | null>(null);

  // localStorage is only available after hydration.
  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);

  const runSync = useCallback(async (deviceToken: string) => {
    try {
      const response = await fetch("/api/public/player/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ appVersion: APP_VERSION }),
      });
      if (response.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setSync(null);
        return;
      }
      if (!response.ok) throw new Error("sync");
      const data = (await response.json()) as SyncResponse;
      setSync((previous) => {
        const changed = previous?.playlist?.revision !== data.playlist?.revision;
        if (changed) setIndex(0);
        return data;
      });
      if (data.commands.includes("reload") || data.commands.includes("restart")) {
        window.location.reload();
      }
      setError(null);
    } catch {
      setError("Sem conexão com o servidor. Tentando novamente…");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void runSync(token);
    const interval = window.setInterval(() => void runSync(token), 60_000);
    return () => window.clearInterval(interval);
  }, [token, runSync]);

  const items = sync?.playlist?.items ?? [];
  const current = items[index % Math.max(items.length, 1)];

  // Images advance on a timer; videos advance when they end.
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!current || items.length === 0) return;
    if (current.kind === "video") return;
    timerRef.current = window.setTimeout(
      () => setIndex((value) => (value + 1) % items.length),
      Math.max(1000, current.durationMs),
    );
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [current, items.length]);

  if (!ready) return <div className="min-h-screen bg-black" />;

  if (!token) {
    return (
      <PairingScreen
        onPaired={(newToken) => {
          window.localStorage.setItem(TOKEN_KEY, newToken);
          setToken(newToken);
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {items.length === 0 ? (
        <div className="grid min-h-screen place-items-center px-8 text-center">
          <div>
            <p className="text-2xl font-semibold text-white">
              {sync?.device.name ?? "Tela conectada"}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {error ?? "Nenhuma playlist programada para este horário."}
            </p>
          </div>
        </div>
      ) : current?.kind === "video" ? (
        <video
          key={`${current.id}-${index}`}
          src={current.url}
          className="h-screen w-screen object-contain"
          autoPlay
          muted={current.isMuted}
          playsInline
          onEnded={() => setIndex((value) => (value + 1) % items.length)}
          onError={() => setIndex((value) => (value + 1) % items.length)}
        />
      ) : current?.kind === "web" ? (
        <iframe
          key={`${current.id}-${index}`}
          src={current.url}
          title={current.name}
          className="h-screen w-screen border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <img
          key={`${current?.id}-${index}`}
          src={current?.url}
          alt={current?.name ?? ""}
          className="h-screen w-screen object-contain"
        />
      )}
    </div>
  );
}

function PairingScreen({ onPaired }: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/public/player/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as { deviceToken?: string; error?: string };
      if (!response.ok || !data.deviceToken) {
        setMessage(data.error ?? "Não foi possível parear esta tela.");
        return;
      }
      onPaired(data.deviceToken);
    } catch {
      setMessage("Sem conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-black px-6 text-white">
      <form onSubmit={submit} className="w-full max-w-sm text-center">
        <p className="text-sm uppercase tracking-widest text-white/50">MDI 360</p>
        <h1 className="mt-3 text-2xl font-semibold">Conectar esta tela</h1>
        <p className="mt-2 text-sm text-white/60">
          Digite o código de 6 dígitos gerado no painel, em Telas.
        </p>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoFocus
          placeholder="000000"
          className="mt-6 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-center text-3xl tracking-[0.4em] outline-none focus:border-white/50"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
        >
          {busy ? "Conectando…" : "Conectar"}
        </button>
        {message ? <p className="mt-4 text-sm text-red-400">{message}</p> : null}
      </form>
    </div>
  );
}