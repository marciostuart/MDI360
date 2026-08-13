import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured, schema } from "@/lib/db/index.server";
import { decryptCredential } from "@/lib/billing/mercado-pago-config.server";
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
const AGGREGATE_PATH = "/portaldeloterias/api/home/ultimos-resultados";
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 8_000;
const LEASE_MS = 4 * 60_000;
type LotterySourceSettings = {
  refreshMinutes: number;
  relay: { url: string; token: string } | null;
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
    return { refreshMinutes: 30, relay: null };
  }
  const relay = (root as Record<string, unknown>).lotteryRelay;
  if (!relay || typeof relay !== "object" || Array.isArray(relay)) {
    return { refreshMinutes: 30, relay: null };
  }
  const values = relay as Record<string, unknown>;
  const refreshMinutes = normalizeRefreshMinutes(values.refreshMinutes);
  if (values.enabled === false) return { refreshMinutes, relay: null };
  const url = String(values.url ?? "").trim();
  const token = decryptCredential(String(values.token ?? "")).trim();
  if (!url || !token) throw new Error("Relay de loterias incompleto");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !(parsed.hostname.endsWith(".workers.dev") || parsed.hostname === "mdi.360bh.com.br")
  ) {
    throw new Error("Relay de loterias fora da infraestrutura permitida");
  }
  return { refreshMinutes, relay: { url: parsed.toString(), token } };
}

const aggregateKeys: Record<LotteryGameId, string> = {
  megasena: "megasena",
  lotofacil: "lotofacil",
  quina: "quina",
  lotomania: "lotomania",
  timemania: "timemania",
  duplasena: "duplasena",
  federal: "federal",
  loteca: "loteca",
  diadesorte: "diaDeSorte",
  supersete: "superSete",
  maismilionaria: "maisMilionaria",
};

const sourceRecordSchema = z.record(z.string(), z.unknown());
const aggregateEntrySchema = sourceRecordSchema.and(
  z.object({
    numeroDoConcurso: z.number().int().positive(),
    dataApuracao: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  }),
);

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
  settings: LotterySourceSettings,
): Promise<Record<string, unknown>> {
  const officialUrl = new URL(path, CAIXA_ORIGIN);
  if (
    officialUrl.origin !== CAIXA_ORIGIN ||
    !officialUrl.pathname.startsWith("/portaldeloterias/api/")
  ) {
    throw new Error("Fonte não permitida");
  }

  const relay = settings.relay;
  const url = relay ? new URL(relay.url) : officialUrl;
  if (relay) url.searchParams.set("path", officialUrl.pathname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        referer: "https://loterias.caixa.gov.br/",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        ...(relay ? { authorization: `Bearer ${relay.token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`${relay ? "Relay" : "CAIXA"} HTTP ${response.status}`);
    }
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

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function verifyAgainstAggregate(
  result: NormalizedLotteryResult,
  aggregate: Record<string, unknown>,
) {
  const contest = aggregateEntrySchema.parse(aggregate);
  if (
    contest.numeroDoConcurso !== result.contestNumber ||
    contest.dataApuracao !== result.drawDate
  ) {
    throw new Error(`${result.gameId}: divergência entre os endpoints oficiais`);
  }
  const aggregateNumbers = stringList(aggregate.dezenas);
  if (result.gameId !== "loteca" && !arraysEqual(aggregateNumbers, result.numbers)) {
    throw new Error(`${result.gameId}: resultado divergente entre os endpoints oficiais`);
  }
  if (
    result.gameId === "duplasena" &&
    !arraysEqual(stringList(aggregate.dezenasSegundoSorteio), result.secondDraw)
  ) {
    throw new Error("duplasena: segundo sorteio divergente");
  }
  if (
    result.gameId === "maismilionaria" &&
    !arraysEqual(stringList(aggregate.trevosSorteados), result.clovers)
  ) {
    throw new Error("maismilionaria: trevos divergentes");
  }
  if (result.gameId === "loteca") {
    const aggregateMatches = sourceArray(aggregate.resultadoJogos);
    if (aggregateMatches.length !== result.matches.length)
      throw new Error("loteca: jogos divergentes");
  }
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
    const aggregate = await fetchOfficial(AGGREGATE_PATH, settings);
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
    const gameErrors: string[] = [];
    for (const game of LOTTERY_GAMES) {
      try {
        const aggregateEntry = aggregateEntrySchema.parse(aggregate[aggregateKeys[game.id]]);
        if ((latest.get(game.id) ?? 0) >= aggregateEntry.numeroDoConcurso) continue;

        const sourcePath = `/portaldeloterias/api/${game.id}`;
        const individual = await fetchOfficial(sourcePath, settings);
        const normalized = normalizeIndividual(game.id, individual);
        verifyAgainstAggregate(normalized, aggregateEntry);
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
    await db
      .update(schema.lotterySyncState)
      .set({
        lastSuccessAt: now,
        lastError: gameErrors.length ? gameErrors.join(" | ").slice(0, 1000) : null,
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
  const stale = !lastCheckedAt || Date.now() - lastCheckedAt.getTime() > 6 * 60 * 60 * 1000;
  return {
    source: "Loterias CAIXA",
    sourceUrl: `${CAIXA_ORIGIN}/loterias`,
    lastCheckedAt: lastCheckedAt?.toISOString() ?? null,
    stale,
    results: gameIds.flatMap((gameId) => {
      const row = latest.get(gameId);
      if (!row) return [];
      const parsed = normalizedLotteryResultSchema.safeParse(row.payload);
      return parsed.success ? [parsed.data] : [];
    }),
  };
}
