import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { startEmitterActivation } from "@/lib/queue/emitter-activation";

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
    return startEmitterActivation({
      fetch: window.fetch.bind(window),
      storage: {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
        removeItem: (key) => window.localStorage.removeItem(key),
      },
      schedule: (task, delay) => {
        const timer = window.setTimeout(task, delay);
        return () => window.clearTimeout(timer);
      },
      onState: (nextCode, nextMessage) => { setCode(nextCode); setMessage(nextMessage); },
      onLinked: (token) => window.location.replace(`/emitir/${encodeURIComponent(token)}`),
    });
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
