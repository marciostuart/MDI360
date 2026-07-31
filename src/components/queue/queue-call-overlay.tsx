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
 * One shared AudioContext for the whole page. Kiosk browsers only allow audio
 * after a gesture, so it is created once, resumed on any interaction, and
 * reused by every call — otherwise the first call of the day would be silent.
 */
let sharedCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) {
    sharedCtx = new Ctor();
    const unlock = () => void sharedCtx?.resume().catch(() => undefined);
    for (const event of ["pointerdown", "keydown", "touchstart"]) {
      window.addEventListener(event, unlock, { passive: true });
    }
  }
  return sharedCtx;
}

/**
 * Strong two-tone alert (550 Hz / 750 Hz — deeper, easier on the ear),
 * synthesized and repeated so it carries across a noisy waiting room. Played
 * even when the screen is muted: a queue call must always be audible.
 */
async function playChime(): Promise<void> {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime + 0.05;
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    // Three "ding-dong" pairs: 750Hz then 550Hz, sine + square for punch.
    const notes = [750, 550, 750, 550, 750, 550];
    notes.forEach((frequency, position) => {
      const start = now + position * 0.22;
      for (const [type, level] of [
        ["sine", 0.8],
        ["square", 0.22],
      ] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.21);
        osc.connect(gain).connect(master);
        osc.start(start);
        osc.stop(start + 0.22);
      }
    });

    await new Promise((resolve) => window.setTimeout(resolve, notes.length * 220 + 150));
  } catch {
    // Audio blocked on this device; the visual call still shows.
  }
}

/** Speaks with the device's engine; resolves false when nothing was spoken. */
function speakLocally(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
        resolve(false);
        return;
      }
      synth.cancel();
      const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
      let started = false;
      // Announced twice: on a busy counter the first call is often missed.
      for (let i = 0; i < 2; i += 1) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pt-BR";
        utterance.rate = 0.95;
        utterance.volume = 1;
        if (voice) utterance.voice = voice;
        utterance.onstart = () => {
          started = true;
        };
        if (i === 1) utterance.onend = () => resolve(started);
        synth.speak(utterance);
      }
      // Some kiosk builds expose speechSynthesis but never fire: give up early
      // so the server-rendered MP3 can take over.
      window.setTimeout(() => resolve(started), 1500);
    } catch {
      resolve(false);
    }
  });
}

/** Server-rendered MP3 (pt-BR), used whenever the device has no speech engine. */
async function speakFromServer(audioUrl?: string): Promise<void> {
  if (!audioUrl) return;
  try {
    const audio = new Audio(audioUrl);
    audio.volume = 1;
    await audio.play();
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      window.setTimeout(resolve, 15000);
    });
  } catch {
    // Nothing else to try; the ticket is still shown large on screen.
  }
}

/** Chime, then voice — local engine first, server MP3 as fallback. */
async function announce(call: QueueCallPayload): Promise<void> {
  await playChime();
  const spoken = await speakLocally(call.spokenText);
  if (!spoken) await speakFromServer(call.audioUrl);
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
      if (!cancelled) await announce(call);
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
  }, [call]);

  const accent = accentColor ?? "#38bdf8";
  const history = (call.history ?? []).slice(0, 4);

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black px-10 text-center">
      <div>
        <p
          className="text-[2.7vw] font-semibold uppercase tracking-[0.35em]"
          style={{ color: accent }}
        >
          Senha chamada
        </p>
        <p
          className="mt-[2vh] text-[17.7vw] font-black leading-none text-white"
          style={{ opacity: flash ? 1 : 0.45, transition: "opacity 300ms linear" }}
        >
          {call.label}
        </p>
        {call.sectorName ? (
          <p
            className="mt-[2vh] text-[5vw] font-bold uppercase leading-tight"
            style={{ color: accent }}
          >
            {call.sectorName}
          </p>
        ) : null}
        {history.length > 0 ? (
          <div className="mt-[6vh]">
            <p className="text-[1.35vw] font-semibold uppercase tracking-[0.35em] text-white/40">
              Últimas chamadas
            </p>
            <p className="mt-[1.5vh] text-[3.3vw] font-black leading-none tracking-wide text-white/75">
              {history.map((item) => item.label).join("     ")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
