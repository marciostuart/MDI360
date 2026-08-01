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
  /** Aparência configurada pelo cliente (cores e fundo). */
  theme?: {
    bgColor?: string | null;
    bgImageUrl?: string | null;
    ticketColor?: string | null;
    textColor?: string | null;
    historyColor?: string | null;
  } | null;
  /** Volumes e tom de chamada configurados pelo cliente. */
  sound?: {
    chimeUrl?: string | null;
    /** 0-100 */
    chimeVolume?: number | null;
    /** 0-300 — acima de 100 amplifica a fala via Web Audio. */
    voiceVolume?: number | null;
  } | null;
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
 * Plays an audio URL at the requested volume. Values above 100% go through Web
 * Audio, the only way to amplify past the element's 1.0 ceiling — that is how
 * the voice can be louder than the chime. Same-origin URLs only, otherwise the
 * graph is tainted and silent.
 */
async function playUrl(url: string, percent: number, timeoutMs: number): Promise<boolean> {
  const volume = Math.max(0, percent) / 100;
  if (volume === 0) return true;
  let audio: HTMLAudioElement;
  try {
    audio = new Audio(url);
  } catch {
    return false;
  }
  audio.volume = Math.min(1, volume);

  if (volume > 1) {
    try {
      const ctx = audioContext();
      if (ctx) {
        if (ctx.state === "suspended") await ctx.resume();
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = Math.min(volume, 4);
        source.connect(gain).connect(ctx.destination);
      }
    } catch {
      // Web Audio unavailable: plays at the element's maximum volume.
    }
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    window.setTimeout(() => finish(true), timeoutMs);
    void audio.play().catch(() => finish(false));
  });
}

/**
 * Call signal: the tone the customer uploaded when there is one, otherwise the
 * same chime.mp3 shipped with the Roku channel. If neither can play we fall
 * back to synthesizing the two-tone square wave.
 */
async function playChime(call: QueueCallPayload): Promise<void> {
  const percent = call.sound?.chimeVolume ?? 55;
  const custom = call.sound?.chimeUrl ?? null;
  if (custom && (await playUrl(custom, percent, 8000))) return;
  if (await playUrl("/chime.mp3", percent, 6000)) return;
  await playSynthChime(Math.max(0, percent) / 100);
}

async function playSynthChime(volume = 0.55): Promise<void> {
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
    const peak = Math.max(0.0002, Math.min(1, volume));
    for (const [frequency, duration] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      gain.gain.setValueAtTime(peak, start + duration - 0.03);
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
async function speakFromServer(audioUrl: string | undefined, percent: number): Promise<boolean> {
  if (!audioUrl) return false;
  return await playUrl(audioUrl, percent, 15000);
}

/**
 * Chime, then voice. Same order and same voice as the Roku channel: the
 * server-rendered MP3 is preferred, and the device speech engine is only a
 * fallback for when that MP3 cannot be fetched or played.
 */
async function announce(call: QueueCallPayload): Promise<void> {
  await playChime(call);
  const spoken = await speakFromServer(call.audioUrl, call.sound?.voiceVolume ?? 200);
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

  // Cores personalizadas pelo cliente; os padrões repetem o canal Roku.
  const accent = call.theme?.textColor || "#38bdf8";
  const ticketColor = call.theme?.ticketColor || "#ffffff";
  const historyColor = call.theme?.historyColor || "#ffffff";
  const bgColor = call.theme?.bgColor || "#000000";
  const bgImageUrl = call.theme?.bgImageUrl || null;
  const history = (call.history ?? []).slice(0, 3);

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-cover bg-center px-10 text-center"
      style={{
        backgroundColor: bgColor,
        ...(bgImageUrl ? { backgroundImage: `url(${JSON.stringify(bgImageUrl)})` } : {}),
      }}
    >
      <div>
        <p
          className="text-[2.7vw] font-semibold uppercase tracking-[0.35em]"
          style={{ color: accent }}
        >
          Senha chamada
        </p>
        <p
          className="mt-[2vh] text-[17.7vw] font-black leading-none"
          style={{
            color: ticketColor,
            opacity: flash ? 1 : 0.45,
            transition: "opacity 300ms linear",
          }}
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
            <p
              className="text-[1.35vw] font-semibold uppercase tracking-[0.35em]"
              style={{ color: historyColor, opacity: 0.55 }}
            >
              Últimas chamadas
            </p>
            <p
              className="mt-[1.5vh] text-[3.3vw] font-black leading-none tracking-wide"
              style={{ color: historyColor }}
            >
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
