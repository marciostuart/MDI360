import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DEFAULT_LANDING_CONTENT, normalizeLandingContent } from "./landing-content";
import type { LandingContent } from "./landing-content";

const item = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
});
const contentSchema = z.object({
  eyebrow: z.string().max(160),
  headline: z.string().min(1).max(160),
  highlightedHeadline: z.string().min(1).max(160),
  heroDescription: z.string().min(1).max(700),
  primaryCta: z.string().min(1).max(60),
  secondaryCta: z.string().min(1).max(60),
  heroImageUrl: z.string().max(1000),
  platformImageUrl: z.string().max(1000),
  queueImageUrl: z.string().max(1000),
  whatsappUrl: z.string().max(1000),
  proofLine: z.string().max(300),
  stats: z.array(item).max(6),
  audiences: z.array(item).min(1).max(8),
  features: z.array(item).min(1).max(12),
  resellerTitle: z.string().min(1).max(200),
  resellerDescription: z.string().min(1).max(700),
  faqs: z
    .array(z.object({ question: z.string().min(1).max(220), answer: z.string().min(1).max(700) }))
    .max(12),
  finalTitle: z.string().min(1).max(200),
  finalDescription: z.string().min(1).max(500),
});

export const fetchLandingContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingContent> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return DEFAULT_LANDING_CONTENT;
    try {
      const { eq } = await import("drizzle-orm");
      const [row] = await getDb()
        .select({ value: schema.platformSettings.value })
        .from(schema.platformSettings)
        .where(eq(schema.platformSettings.key, "landing"))
        .limit(1);
      return normalizeLandingContent(row?.value);
    } catch {
      return DEFAULT_LANDING_CONTENT;
    }
  },
);

export const saveLandingContent = createServerFn({ method: "POST" })
  .validator(contentSchema)
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { getSessionUser } = await import("@/lib/auth/session.server");
    const user = await getSessionUser();
    const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (!user || !allowed.includes(user.email.toLowerCase())) throw new Error("FORBIDDEN");
    await getDb()
      .insert(schema.platformSettings)
      .values({ key: "landing", value: data })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value: data, updatedAt: new Date() },
      });
    return { ok: true };
  });
