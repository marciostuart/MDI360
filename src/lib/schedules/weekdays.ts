/** Shared, client-safe helpers for the schedule UI (bitmask + HH:MM math). */
export type Weekday = { bit: number; short: string };

export const WEEKDAYS: Weekday[] = [
  { bit: 0, short: "Dom" },
  { bit: 1, short: "Seg" },
  { bit: 2, short: "Ter" },
  { bit: 3, short: "Qua" },
  { bit: 4, short: "Qui" },
  { bit: 5, short: "Sex" },
  { bit: 6, short: "Sáb" },
];

export function minutesToTime(minute: number) {
  const clamped = Math.max(0, Math.min(1440, minute));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const [h, m] = value.split(":");
  return Math.max(0, Math.min(1440, Number(h ?? 0) * 60 + Number(m ?? 0)));
}