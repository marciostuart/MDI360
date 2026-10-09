import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured, schema } from "@/lib/db/index.server";
import {
  LOTTERY_GAMES,
  type LotteryGameId,
  type NormalizedLotteryResult,
  normalizedLotteryResultSchema,
} from "@/lib/widgets/lottery";
import {
  AUTH_ERROR_BACKOFF_MS,
  lotteryRetryDelayMs,
  normalizeRefreshMinutes,
} from "@/lib/widgets/lottery-polling";

const CAIXA_ORIGIN = "https://servicebus2.caixa.gov.br";
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 8_000;
const LEASE_MS = 4 * 60_000;
type LotterySourceSettings = {
  refreshMinutes: number;
};

async function readLotterySourceSettings(): Promise<LotterySourceSettings> {
  const db = getDb();
  const [row] = await db
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, "data-sources"))
    .limit(1);
  const root = row?.value;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return { refreshMinutes: 10 };
  }
  const values = (root as Record<string, unknown>).lotteryRelay;
  const refreshMinutes =
    values && typeof values === "object" && !Array.isArray(values)
      ? Math.min(10, normalizeRefreshMinutes((values as Record<string, unknown>).refreshMinutes))
      : 10;
  return { refreshMinutes };
}

const sourceRecordSchema = z.record(z.string(), z.unknown());

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function sourceArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = sourceRecordSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

async function fetchOfficial(
  path: string,
  _settings: LotterySourceSettings,
): Promise<Record<string, unknown>> {
  const officialUrl = new URL(path, CAIXA_ORIGIN);
  if (
    officialUrl.origin !== CAIXA_ORIGIN ||
    !officialUrl.pathname.startsWith("/portaldeloterias/api/")
  ) {
    throw new Error("Fonte não permitida");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(officialUrl, {
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        referer: "https://loterias.caixa.gov.br/",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`CAIXA HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Resposta CAIXA excedeu o limite");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("Resposta CAIXA excedeu o limite");
    return sourceRecordSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } finally {
    clearTimeout(timer);
  }
}

function expectedNumberCount(gameId: LotteryGameId) {
  return LOTTERY_GAMES.find((game) => game.id === gameId)!.count;
}

export function normalizeIndividual(
  gameId: LotteryGameId,
  source: Record<string, unknown>,
): NormalizedLotteryResult {
  const contestNumber = numberValue(source.numero);
  const drawDate = cleanText(source.dataApuracao);
  if (!contestNumber || !Number.isInteger(contestNumber) || !drawDate) {
    throw new Error(`${gameId}: concurso ou data ausente`);
  }

  const numbers = stringList(source.listaDezenas);
  if (gameId !== "loteca" && numbers.length !== expectedNumberCount(gameId)) {
    throw new Error(`${gameId}: quantidade de resultados inválida (${numbers.length})`);
  }

  const secondDraw = stringList(source.listaDezenasSegundoSorteio);
  if (gameId === "duplasena" && secondDraw.length !== 6) {
    throw new Error("duplasena: segundo sorteio incompleto");
  }

  const clovers = stringList(source.trevosSorteados);
  if (gameId === "maismilionaria" && clovers.length !== 2) {
    throw new Error("maismilionaria: trevos incompletos");
  }

  const rawPrizes = sourceArray(source.listaRateioPremio);
  const prizes = rawPrizes.map((prize) => ({
    label: cleanText(prize.descricaoFaixa) ?? `Faixa ${prize.faixa ?? ""}`.trim(),
    winners: Math.max(0, Math.trunc(numberValue(prize.numeroDeGanhadores) ?? 0)),
    value: numberValue(prize.valorPremio) ?? 0,
  }));

  const federalPrizes =
    gameId === "federal"
      ? numbers.map((ticket, index) => ({
          ticket,
          label: `${index + 1}º prêmio`,
          winners: prizes[index]?.winners ?? 1,
          value: prizes[index]?.value ?? 0,
        }))
      : [];
  if (gameId === "federal" && federalPrizes.length !== 5) {
    throw new Error("federal: relação de prêmios incompleta");
  }

  const matches =
    gameId === "loteca"
      ? sourceArray(source.listaResultadoEquipeEsportiva).map((match) => ({
          order: Math.trunc(numberValue(match.nuSequencial) ?? 0),
          home: cleanText(match.nomeEquipeUm) ?? "",
          away: cleanText(match.nomeEquipeDois) ?? "",
          homeScore: Math.trunc(numberValue(match.nuGolEquipeUm) ?? 0),
          awayScore: Math.trunc(numberValue(match.nuGolEquipeDois) ?? 0),
          date: cleanText(match.dtJogo),
        }))
      : [];
  if (
    gameId === "loteca" &&
    (matches.length !== 14 || matches.some((match) => !match.home || !match.away))
  ) {
    throw new Error("loteca: relação de 14 jogos incompleta");
  }

  const special = cleanText(source.nomeTimeCoracaoMesSorte);
  return normalizedLotteryResultSchema.parse({
    gameId,
    gameName: LOTTERY_GAMES.find((game) => game.id === gameId)!.label,
    contestNumber,
    drawDate,
    numbers,
    secondDraw,
    luckyMonth: gameId === "diadesorte" ? special : null,
    heartTeam: gameId === "timemania" ? special : null,
    clovers,
    federalPrizes,
    matches,
    accumulated: Boolean(source.acumulado),
    nextEstimate: numberValue(source.valorEstimadoProximoConcurso),
    nextDate: cleanText(source.dataProximoConcurso),
    prizes,
  });
}

async function acquireLease(refreshMinutes: number, force: boolean) {
  const db = getDb();
  await db.insert(schema.lotterySyncState).values({ id: "caixa" }).onConflictDoNothing();
  const now = new Date();
  const leaseAvailable = or(
    isNull(schema.lotterySyncState.leaseUntil),
    lt(schema.lotterySyncState.leaseUntil, now),
  );
  const dueBefore = new Date(now.getTime() - refreshMinutes * 60_000);
  const due = or(
    isNull(schema.lotterySyncState.lastAttemptAt),
    lt(schema.lotterySyncState.lastAttemptAt, dueBefore),
  );
  const rows = await db
    .update(schema.lotterySyncState)
    .set({
      lastAttemptAt: now,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      updatedAt: now,
    })
    .where(
      force
        ? and(eq(schema.lotterySyncState.id, "caixa"), leaseAvailable)
        : and(eq(schema.lotterySyncState.id, "caixa"), leaseAvailable, due),
    )
    .returning({ id: schema.lotterySyncState.id });
  return rows.length > 0;
}

export async function syncOfficialLotteryResults(
  options: { force?: boolean } = {},
): Promise<{ updated: number; skipped: boolean }> {
  if (!isDatabaseConfigured()) return { updated: 0, skipped: true };
  let settings: LotterySourceSettings;
  try {
    settings = await readLotterySourceSettings();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fonte de loterias inválida";
    if (!(await acquireLease(30, options.force === true))) {
      return { updated: 0, skipped: true };
    }
    const now = new Date();
    await getDb()
      .update(schema.lotterySyncState)
      .set({
        lastError: message,
        leaseUntil: new Date(now.getTime() + AUTH_ERROR_BACKOFF_MS),
        updatedAt: now,
      })
      .where(eq(schema.lotterySyncState.id, "caixa"));
    console.error(`[lottery-sync] ${message}`);
    return { updated: 0, skipped: false };
  }
  if (!(await acquireLease(settings.refreshMinutes, options.force === true))) {
    return { updated: 0, skipped: true };
  }

  const db = getDb();
  try {
    const stored = await db
      .selectDistinctOn([schema.lotteryResults.gameId], {
        gameId: schema.lotteryResults.gameId,
        contest: schema.lotteryResults.contestNumber,
      })
      .from(schema.lotteryResults)
      .orderBy(schema.lotteryResults.gameId, desc(schema.lotteryResults.contestNumber));
    const latest = new Map<string, number>();
    for (const row of stored)
      latest.set(row.gameId, Math.max(latest.get(row.gameId) ?? 0, row.contest));

    let updated = 0;
    let successfulQueries = 0;
    const gameErrors: string[] = [];
    for (const game of LOTTERY_GAMES) {
      try {
        const sourcePath = `/portaldeloterias/api/${game.id}`;
        const individual = await fetchOfficial(sourcePath, settings);
        const normalized = normalizeIndividual(game.id, individual);
        successfulQueries += 1;
        if ((latest.get(game.id) ?? 0) >= normalized.contestNumber) continue;
        const now = new Date();
        await db
          .insert(schema.lotteryResults)
          .values({
            gameId: game.id,
            contestNumber: normalized.contestNumber,
            drawDate: normalized.drawDate,
            payload: normalized,
            sourceUrl: `${CAIXA_ORIGIN}${sourcePath}`,
            confirmedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [schema.lotteryResults.gameId, schema.lotteryResults.contestNumber],
            set: {
              payload: normalized,
              sourceUrl: `${CAIXA_ORIGIN}${sourcePath}`,
              confirmedAt: now,
              updatedAt: now,
            },
          });
        updated += 1;
      } catch (error) {
        gameErrors.push(
          `${game.id}: ${error instanceof Error ? error.message.slice(0, 180) : "falha de validação"}`,
        );
      }
    }

    const now = new Date();
    const errorMessage =
      successfulQueries === 0
        ? gameErrors.join(" | ").slice(0, 1000) || "Nenhuma modalidade retornou resultado válido"
        : gameErrors.length
          ? gameErrors.join(" | ").slice(0, 1000)
          : null;
    await db
      .update(schema.lotterySyncState)
      .set({
        // A cycle in which every individual official endpoint failed is not a
        // successful refresh. Keep the previous success timestamp truthful
        // and record the upstream cause for diagnosis.
        ...(successfulQueries > 0 ? { lastSuccessAt: now } : {}),
        lastError: errorMessage,
        leaseUntil: null,
        updatedAt: now,
      })
      .where(eq(schema.lotterySyncState.id, "caixa"));
    return { updated, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Falha desconhecida";
    const retryMs = lotteryRetryDelayMs(message, settings.refreshMinutes);
    const now = new Date();
    await db
      .update(schema.lotterySyncState)
      .set({
        lastError: message,
        leaseUntil: new Date(now.getTime() + retryMs),
        updatedAt: now,
      })
      .where(eq(schema.lotterySyncState.id, "caixa"));
    console.error(`[lottery-sync] ${message}`);
    return { updated: 0, skipped: false };
  }
}

export async function readLotteryResults(gameIds: LotteryGameId[]) {
  // The background loop is the normal path. This guarded call also covers
  // serverless/restarted processes where the loop has not fired yet; the DB
  // lease and refresh interval prevent one request per terminal from hitting
  // the CAIXA endpoints.
  try {
    await syncOfficialLotteryResults();
  } catch (error) {
    console.error(
      `[lottery-sync] leitura preservou o cache após falha: ${
        error instanceof Error ? error.message : "falha desconhecida"
      }`,
    );
  }
  const db = getDb();
  const [rows, states] = await Promise.all([
    db
      .selectDistinctOn([schema.lotteryResults.gameId])
      .from(schema.lotteryResults)
      .orderBy(schema.lotteryResults.gameId, desc(schema.lotteryResults.contestNumber)),
    db
      .select()
      .from(schema.lotterySyncState)
      .where(eq(schema.lotterySyncState.id, "caixa"))
      .limit(1),
  ]);
  const latest = new Map<LotteryGameId, (typeof rows)[number]>();
  for (const row of rows) {
    const id = row.gameId as LotteryGameId;
    const current = latest.get(id);
    if (!current || row.contestNumber > current.contestNumber) latest.set(id, row);
  }
  const state = states[0];
  const lastCheckedAt = state?.lastSuccessAt ?? null;
  const results = gameIds.flatMap((gameId) => {
    const row = latest.get(gameId);
    if (!row) return [];
    const parsed = normalizedLotteryResultSchema.safeParse(row.payload);
    return parsed.success ? [parsed.data] : [];
  });

  // A valid cached result remains usable even when there has been no new
  // contest for several hours or the upstream source is temporarily offline.
  // "stale" describes the absence of usable data, not the age of the contest.
  const stale = results.length === 0;
  return {
    source: "Loterias CAIXA",
    sourceUrl: `${CAIXA_ORIGIN}/loterias`,
    lastCheckedAt: lastCheckedAt?.toISOString() ?? null,
    stale,
    results,
  };
}
