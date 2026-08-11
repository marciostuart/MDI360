import { z } from "zod";

export const LOTTERY_GAMES = [
  { id: "megasena", label: "Mega-Sena", count: 6 },
  { id: "lotofacil", label: "Lotofácil", count: 15 },
  { id: "quina", label: "Quina", count: 5 },
  { id: "lotomania", label: "Lotomania", count: 20 },
  { id: "timemania", label: "Timemania", count: 7 },
  { id: "duplasena", label: "Dupla Sena", count: 6 },
  { id: "federal", label: "Loteria Federal", count: 5 },
  { id: "loteca", label: "Loteca", count: 14 },
  { id: "diadesorte", label: "Dia de Sorte", count: 7 },
  { id: "supersete", label: "Super Sete", count: 7 },
  { id: "maismilionaria", label: "+Milionária", count: 6 },
] as const;

export const LOTTERY_GAME_IDS = LOTTERY_GAMES.map((game) => game.id);
export type LotteryGameId = (typeof LOTTERY_GAMES)[number]["id"];

export const lotteryGameIdSchema = z.enum(LOTTERY_GAME_IDS as [LotteryGameId, ...LotteryGameId[]]);

export const lotteryPrizeSchema = z.object({
  label: z.string(),
  winners: z.number().int().nonnegative(),
  value: z.number().nonnegative(),
});

export const lotteryMatchSchema = z.object({
  order: z.number().int().min(1).max(14),
  home: z.string(),
  away: z.string(),
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
  date: z.string().nullable(),
});

export const normalizedLotteryResultSchema = z.object({
  gameId: lotteryGameIdSchema,
  gameName: z.string(),
  contestNumber: z.number().int().positive(),
  drawDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  numbers: z.array(z.string()),
  secondDraw: z.array(z.string()).default([]),
  luckyMonth: z.string().nullable().default(null),
  heartTeam: z.string().nullable().default(null),
  clovers: z.array(z.string()).default([]),
  federalPrizes: z.array(lotteryPrizeSchema.extend({ ticket: z.string() })).default([]),
  matches: z.array(lotteryMatchSchema).default([]),
  accumulated: z.boolean().default(false),
  nextEstimate: z.number().nonnegative().nullable().default(null),
  nextDate: z.string().nullable().default(null),
  prizes: z.array(lotteryPrizeSchema).default([]),
});

export type NormalizedLotteryResult = z.infer<typeof normalizedLotteryResultSchema>;

export function lotteryDurationMs(config: { gameIds: readonly string[]; rotateSeconds: number }) {
  return config.gameIds.length * config.rotateSeconds * 1000;
}
