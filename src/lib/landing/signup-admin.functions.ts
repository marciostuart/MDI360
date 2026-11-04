import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function authorize() {
  const { requirePlatformAdmin } = await import("@/lib/admin/admin-auth.server");
  return requirePlatformAdmin();
}
export const fetchSignupAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await authorize();
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { desc, eq, isNotNull } = await import("drizzle-orm");
  const db = getDb();
  const [setting] = await db
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, "signup_webhook"))
    .limit(1);
  const rows = await db
    .select({
      id: schema.signupRequests.id,
      email: schema.signupRequests.email,
      payloadEncrypted: schema.signupRequests.payloadEncrypted,
      createdAt: schema.signupRequests.createdAt,
      webhookStatus: schema.signupRequests.webhookStatus,
    })
    .from(schema.signupRequests)
    .where(isNotNull(schema.signupRequests.usedAt))
    .orderBy(desc(schema.signupRequests.createdAt))
    .limit(100);
  const { decryptSignupPayload } = await import("@/lib/landing/signup-crypto.server");
  const leads = rows.map((row) => {
    try {
      const p = decryptSignupPayload(row.payloadEncrypted) as Record<string, unknown>;
      return {
        id: row.id,
        email: row.email,
        name: String(p.name ?? ""),
        profile: String(p.type ?? ""),
        createdAt: row.createdAt.toISOString(),
        webhookStatus: row.webhookStatus,
        payload: JSON.stringify(p, null, 2),
      };
    } catch {
      return {
        id: row.id,
        email: row.email,
        name: "Dados indisponíveis",
        profile: "",
        createdAt: row.createdAt.toISOString(),
        webhookStatus: row.webhookStatus,
        payload: "{}",
      };
    }
  });
  const value = setting?.value as { enabled?: boolean; url?: string } | undefined;
  return { webhook: { enabled: value?.enabled === true, url: value?.url ?? "" }, leads };
});
export const saveSignupWebhook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ enabled: z.boolean(), url: z.string().trim().max(2000) }).parse(input),
  )
  .handler(async ({ data }) => {
    await authorize();
    if (data.enabled) {
      const { webhookDestination } = await import("@/lib/landing/signup-webhook.server");
      await webhookDestination(data.url);
    }
    const { getDb, schema } = await import("@/lib/db/index.server");
    await getDb()
      .insert(schema.platformSettings)
      .values({ key: "signup_webhook", value: data })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value: data, updatedAt: new Date() },
      });
    return data;
  });
