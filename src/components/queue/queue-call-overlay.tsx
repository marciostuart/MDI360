import { useEffect, useRef, useState } from "react";

export type QueueCallPayload = {
  id: string;
  label: string;
  sectorName: string | null;
  spokenText: string;
  /** MP3 pronto no servidor (usado por players sem síntese de voz). */
  audioUrl?: string;
  displaySeconds: number;
  calledAt: string;
  /** Últimas senhas chamadas antes desta (mais recente primeiro). */
  history?: { label: string; sectorName: string | null }[] | null;
};

/**
 * Plays a chime and speaks the announcement. The chime is synthesized with the
 * Web Audio API (no asset to download) and is deliberately played even when the
 * screen is configured as muted: a queue call must always be audible.
 */
async function playChime() {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;
    // Two-note "ding-dong", the classic queue chime.
    for (const [index, frequency] of [880, 660].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = now + index * 0.35;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.6, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.33);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  } catch {
    // Audio blocked on this device; the visual call still shows.
  } finally {
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  }
}

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
    // Announced twice: on a busy counter the first call is often missed.
    for (let i = 0; i < 2; i += 1) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 0.95;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      synth.speak(utterance);
    }
  } catch {
    // No speech engine on this device: the ticket is still shown large.
  }
}

/**
 * Full-screen ticket call. Rendered instead of the playlist so the content is
 * interrupted immediately, exactly as the operator expects.
 */
export function QueueCallOverlay({
  call,
  accentColor,
  onDone,
}: {
  call: QueueCallPayload;
  accentColor?: string | null;
  onDone: () => void;
}) {
  const [flash, setFlash] = useState(true);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await playChime();
      if (!cancelled) speak(call.spokenText);
    })();

    const blink = window.setInterval(() => setFlash((value) => !value), 700);
    const timer = window.setTimeout(
      () => doneRef.current(),
      Math.max(5, call.displaySeconds) * 1000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(blink);
      window.clearTimeout(timer);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, [call.id, call.spokenText, call.displaySeconds]);

  const accent = accentColor ?? "#38bdf8";
  const history = (call.history ?? []).slice(0, 4);

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black px-10 text-center">
      <div>
        <p className="text-[3vw] font-semibold uppercase tracking-[0.4em]" style={{ color: accent }}>
          Senha chamada
        </p>
        <p
          className="mt-4 text-[18vw] font-black leading-none text-white"
          style={{ opacity: flash ? 1 : 0.45, transition: "opacity 300ms linear" }}
        >
          {call.label}
        </p>
        {call.sectorName ? (
          <p className="mt-6 text-[6vw] font-semibold leading-tight" style={{ color: accent }}>
            {call.sectorName}
          </p>
        ) : null}
        {history.length > 0 ? (
          <div className="mt-[6vh]">
            <p className="text-[1.3vw] font-semibold uppercase tracking-[0.35em] text-white/40">
              Últimas chamadas
            </p>
            <div className="mt-4 flex flex-wrap items-stretch justify-center gap-[1.2vw]">
              {history.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="min-w-[10vw] rounded-xl border border-white/10 bg-white/5 px-[1.6vw] py-[1vh]"
                >
                  <p className="text-[3vw] font-black leading-none text-white/80">{item.label}</p>
                  {item.sectorName ? (
                    <p className="mt-[0.6vh] text-[1.2vw] font-medium uppercase tracking-widest text-white/45">
                      {item.sectorName}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
