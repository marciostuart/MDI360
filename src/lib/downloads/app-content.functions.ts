import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  DEFAULT_APP_DOWNLOADS_CONTENT,
  normalizeAppDownloadsContent,
  type AppDownloadsContent,
} from "./app-content";

const downloadSchema = z.object({
  label: z.string().min(1).max(100),
  href: z
    .string()
    .min(1)
    .max(2000)
    .refine(
      (value) =>
        value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://"),
      "Use um link HTTP(S) ou um caminho iniciado por /.",
    ),
  secondary: z.boolean().optional(),
});

const appSchema = z.object({
  enabled: z.boolean(),
  title: z.string().min(1).max(160),
  cardDescription: z.string().min(1).max(300),
  cardDetail: z.string().min(1).max(500),
  pageDescription: z.string().min(1).max(500),
  downloadDescription: z.string().min(1).max(300),
  downloads: z.array(downloadSchema).min(1).max(5),
  steps: z.array(z.string().min(1).max(1200)).min(1).max(30),
  notes: z.array(z.string().min(1).max(800)).max(20),
});

const contentSchema = z.object({
  heading: z.string().min(1).max(160),
  introduction: z.string().min(1).max(500),
  footer: z.string().max(800),
  apps: z.object({
    android: appSchema,
    roku: appSchema,
    windows: appSchema,
    linux: appSchema,
  }),
});

export const fetchAppDownloadsContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<AppDownloadsContent> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return DEFAULT_APP_DOWNLOADS_CONTENT;
    try {
      const { eq } = await import("drizzle-orm");
      const [row] = await getDb()
        .select({ value: schema.platformSettings.value })
        .from(schema.platformSettings)
        .where(eq(schema.platformSettings.key, "app-downloads"))
        .limit(1);
      return normalizeAppDownloadsContent(row?.value);
    } catch {
      return DEFAULT_APP_DOWNLOADS_CONTENT;
    }
  },
);

export const saveAppDownloadsContent = createServerFn({ method: "POST" })
  .validator(contentSchema)
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { getSessionUser } = await import("@/lib/auth/session.server");
    const user = await getSessionUser();
    const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!user || !allowed.includes(user.email.toLowerCase())) throw new Error("FORBIDDEN");

    await getDb()
      .insert(schema.platformSettings)
      .values({ key: "app-downloads", value: data })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value: data, updatedAt: new Date() },
      });
    return { ok: true };
  });
