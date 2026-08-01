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
 * Exactly the Roku signal: the same chime.mp3 shipped with the channel, served
 * from /chime.mp3. If the file cannot play (autoplay block, missing asset) we
 * fall back to synthesizing the same two-tone square wave (550 Hz / 700 ms then
 * 440 Hz / 1400 ms) with Web Audio.
 */
async function playChime(): Promise<void> {
  const played = await new Promise<boolean>((resolve) => {
    try {
      const audio = new Audio("/chime.mp3");
      audio.volume = 1;
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      window.setTimeout(() => resolve(true), 6000);
      void audio.play().catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
  if (played) return;
  await playSynthChime();
}

async function playSynthChime(): Promise<void> {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime + 0.05;
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    // 550 Hz (0.7s) followed by 440 Hz (1.4s), no repetition.
    const notes: [number, number][] = [
      [550, 0.7],
      [440, 1.4],
    ];
    let start = now;
    for (const [frequency, duration] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.55, start + 0.02);
      gain.gain.setValueAtTime(0.55, start + duration - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + duration);
      start += duration;
    }

    const totalMs = (start - now) * 1000;
    await new Promise((resolve) => window.setTimeout(resolve, totalMs + 150));
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
      // Falada uma única vez, por pedido do operador.
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 0.95;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        started = true;
      };
      utterance.onend = () => resolve(started);
      synth.speak(utterance);
      // Some kiosk builds expose speechSynthesis but never fire: give up early
      // so the server-rendered MP3 can take over.
      window.setTimeout(() => resolve(started), 1500);
    } catch {
      resolve(false);
    }
  });
}

/** Server-rendered MP3 (pt-BR) — the same voice the Roku channel plays. */
async function speakFromServer(audioUrl?: string): Promise<boolean> {
  if (!audioUrl) return false;
  try {
    const audio = new Audio(audioUrl);
    audio.volume = 1;
    await audio.play();
    return await new Promise<boolean>((resolve) => {
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      window.setTimeout(() => resolve(true), 15000);
    });
  } catch {
    // Nothing else to try; the ticket is still shown large on screen.
    return false;
  }
}

/**
 * Chime, then voice. Same order and same voice as the Roku channel: the
 * server-rendered MP3 is preferred, and the device speech engine is only a
 * fallback for when that MP3 cannot be fetched or played.
 */
async function announce(call: QueueCallPayload): Promise<void> {
  await playChime();
  const spoken = await speakFromServer(call.audioUrl);
  if (!spoken) await speakLocally(call.spokenText);
}

/**
 * Full-screen ticket call. Rendered instead of the playlist so the content is
 * interrupted immediately, exactly as the operator expects.
 */
export function QueueCallOverlay({
  call,
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
      Math.max(10, call.displaySeconds) * 1000,
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

  // Exactly the Roku channel: fixed accent (0x38BDF8) for the title, the sector
  // and the history, so a dark brand colour can never hide the sector name.
  const accent = "#38bdf8";
  const history = (call.history ?? []).slice(0, 3);

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
              {history
                .map((item) => (item.sectorName ? `${item.label} - ${item.sectorName}` : item.label))
                .join("     ")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
