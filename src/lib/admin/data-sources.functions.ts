import { createServerFn } from "@tanstack/react-start";

import {
  DEFAULT_NEWS_SOURCES,
  dataSourcesInputSchema,
  isSafeNewsUrl,
  type DataSourcesInput,
} from "@/lib/widgets/data-sources";
import { NEWS_FEED_IDS } from "@/lib/widgets/catalog";
import { z } from "zod";

async function requirePlatformAdmin() {
  const { getSessionUser } = await import("@/lib/auth/session.server");
  const user = await getSessionUser();
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!user || !allowed.includes(user.email.toLowerCase())) throw new Error("FORBIDDEN");
}

export type DataSourcesAdminView = Omit<DataSourcesInput, "lotteryRelay"> & {
  lotteryRelay: Omit<DataSourcesInput["lotteryRelay"], "token" | "clearToken"> & {
    tokenConfigured: boolean;
  };
  lotteryStatus: {
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
};

export const fetchDataSourcesAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<DataSourcesAdminView> => {
    await requirePlatformAdmin();
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [settings, states] = await Promise.all([
      db
        .select({ value: schema.platformSettings.value })
        .from(schema.platformSettings)
        .where(eq(schema.platformSettings.key, "data-sources"))
        .limit(1),
      db
        .select()
        .from(schema.lotterySyncState)
        .where(eq(schema.lotterySyncState.id, "caixa"))
        .limit(1),
    ]);
    const root =
      settings[0]?.value &&
      typeof settings[0].value === "object" &&
      !Array.isArray(settings[0].value)
        ? (settings[0].value as Record<string, unknown>)
        : {};
    const relay =
      root.lotteryRelay &&
      typeof root.lotteryRelay === "object" &&
      !Array.isArray(root.lotteryRelay)
        ? (root.lotteryRelay as Record<string, unknown>)
        : {};
    const savedNews =
      root.news && typeof root.news === "object" && !Array.isArray(root.news)
        ? (root.news as Record<string, Record<string, unknown>>)
        : {};
    const news = Object.fromEntries(
      Object.entries(DEFAULT_NEWS_SOURCES).map(([id, fallback]) => {
        const saved = savedNews[id] ?? {};
        return [id, { ...fallback, ...saved, id: undefined }];
      }),
    ) as DataSourcesInput["news"];
    const state = states[0];
    return {
      lotteryRelay: {
        enabled: relay.enabled !== false,
        url: String(relay.url ?? ""),
        tokenConfigured: Boolean(String(relay.token ?? "").trim()),
      },
      news,
      lotteryStatus: {
        lastAttemptAt: state?.lastAttemptAt?.toISOString() ?? null,
        lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
        lastError: state?.lastError ?? null,
      },
    };
  },
);

export const saveDataSourcesAdmin = createServerFn({ method: "POST" })
  .validator(dataSourcesInputSchema)
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    if (data.lotteryRelay.url) {
      const relay = new URL(data.lotteryRelay.url);
      if (
        relay.protocol !== "https:" ||
        !(relay.hostname.endsWith(".workers.dev") || relay.hostname === "mdi.360bh.com.br")
      ) {
        throw new Error("Use uma URL do Cloudflare Workers ou do domínio MDI360.");
      }
    }
    for (const source of Object.values(data.news)) {
      if (!isSafeNewsUrl(source.url)) throw new Error("Uma fonte de notícias não é segura.");
    }

    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [current] = await db
      .select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, "data-sources"))
      .limit(1);
    const root =
      current?.value && typeof current.value === "object" && !Array.isArray(current.value)
        ? (current.value as Record<string, unknown>)
        : {};
    const previousRelay =
      root.lotteryRelay &&
      typeof root.lotteryRelay === "object" &&
      !Array.isArray(root.lotteryRelay)
        ? (root.lotteryRelay as Record<string, unknown>)
        : {};
    const token = data.lotteryRelay.clearToken
      ? ""
      : data.lotteryRelay.token.trim() || String(previousRelay.token ?? "");
    const value = {
      lotteryRelay: {
        enabled: data.lotteryRelay.enabled,
        url: data.lotteryRelay.url.trim(),
        token,
      },
      news: data.news,
    };
    await db
      .insert(schema.platformSettings)
      .values({ key: "data-sources", value })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value, updatedAt: new Date() },
      });
    return { ok: true };
  });

export const testLotteryDataSource = createServerFn({ method: "POST" }).handler(async () => {
  await requirePlatformAdmin();
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .update(schema.lotterySyncState)
    .set({ leaseUntil: null })
    .where(eq(schema.lotterySyncState.id, "caixa"));
  const { syncOfficialLotteryResults, readLotteryResults } =
    await import("@/lib/widgets/lottery-sync.server");
  const result = await syncOfficialLotteryResults();
  const payload = await readLotteryResults(["megasena"]);
  const [state] = await getDb()
    .select()
    .from(schema.lotterySyncState)
    .where(eq(schema.lotterySyncState.id, "caixa"))
    .limit(1);
  return {
    ok: payload.results.length > 0,
    updated: result.updated,
    error: state?.lastError ?? null,
  };
});

export const testNewsDataSource = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.enum(NEWS_FEED_IDS as [string, ...string[]]) }))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { getConfiguredNewsFeed } = await import("@/lib/widgets/data-sources.server");
    const source = await getConfiguredNewsFeed(data.id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(source.url, { signal: controller.signal });
      const text = await response.text();
      return { ok: response.ok && /<item[\s>]/i.test(text), status: response.status };
    } finally {
      clearTimeout(timer);
    }
  });
