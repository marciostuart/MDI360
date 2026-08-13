import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { MercadoPagoEnvironment } from "@/lib/billing/mercado-pago-config.server";
import { requirePlatformAdmin } from "@/lib/admin/admin-auth.server";

const environmentSchema = z.enum(["test", "production"]);
const profileSchema = z.object({
  publicKey: z.string().trim().max(300),
  accessToken: z.string().trim().max(1000),
  clearAccessToken: z.boolean().default(false),
  applicationId: z.string().trim().max(80),
  accountId: z.string().trim().regex(/^\d*$/, "O User ID deve conter apenas números.").max(40),
  webhookSecret: z.string().trim().max(1000),
  clearWebhookSecret: z.boolean().default(false),
});

const inputSchema = z.object({
  activeEnvironment: environmentSchema,
  test: profileSchema,
  production: profileSchema,
});

export type MercadoPagoAdminInput = z.infer<typeof inputSchema>;

export type MercadoPagoAdminView = {
  activeEnvironment: MercadoPagoEnvironment;
  webhookUrl: string;
  profiles: Record<
    MercadoPagoEnvironment,
    {
      publicKey: string;
      applicationId: string;
      accountId: string;
      accessTokenConfigured: boolean;
      webhookSecretConfigured: boolean;
      ready: boolean;
    }
  >;
};

function rootObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function profileView(value: unknown) {
  const profile = rootObject(value);
  const publicKey = String(profile.publicKey ?? "");
  const applicationId = String(profile.applicationId ?? "");
  const accountId = String(profile.accountId ?? "");
  const accessTokenConfigured = Boolean(String(profile.accessToken ?? ""));
  const webhookSecretConfigured = Boolean(String(profile.webhookSecret ?? ""));
  return {
    publicKey,
    applicationId,
    accountId,
    accessTokenConfigured,
    webhookSecretConfigured,
    ready: Boolean(publicKey && accountId && accessTokenConfigured && webhookSecretConfigured),
  };
}

export const fetchMercadoPagoAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<MercadoPagoAdminView> => {
    await requirePlatformAdmin();
    const { readStoredMercadoPagoSettings } =
      await import("@/lib/billing/mercado-pago-config.server");
    const settings = await readStoredMercadoPagoSettings();
    const appUrl = (process.env.APP_URL || "https://mdi.360bh.com.br").replace(/\/$/, "");
    return {
      activeEnvironment: settings.activeEnvironment === "production" ? "production" : "test",
      webhookUrl: `${appUrl}/api/public/mercado-pago/webhook`,
      profiles: {
        test: profileView(settings.test),
        production: profileView(settings.production),
      },
    };
  },
);

export const saveMercadoPagoAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq } = await import("drizzle-orm");
    const { encryptCredential, MERCADO_PAGO_SETTINGS_KEY, readStoredMercadoPagoSettings } =
      await import("@/lib/billing/mercado-pago-config.server");
    const previous = await readStoredMercadoPagoSettings();
    const buildProfile = (environment: MercadoPagoEnvironment) => {
      const input = data[environment];
      const old = rootObject(previous[environment]);
      return {
        publicKey: input.publicKey,
        applicationId: input.applicationId,
        accountId: input.accountId,
        accessToken: input.clearAccessToken
          ? ""
          : input.accessToken
            ? encryptCredential(input.accessToken)
            : String(old.accessToken ?? ""),
        webhookSecret: input.clearWebhookSecret
          ? ""
          : input.webhookSecret
            ? encryptCredential(input.webhookSecret)
            : String(old.webhookSecret ?? ""),
      };
    };
    const value = {
      activeEnvironment: data.activeEnvironment,
      test: buildProfile("test"),
      production: buildProfile("production"),
    };
    await getDb()
      .insert(schema.platformSettings)
      .values({ key: MERCADO_PAGO_SETTINGS_KEY, value })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value, updatedAt: new Date() },
      });
    return { ok: true };
  });

export const testMercadoPagoAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ environment: environmentSchema }).parse(input))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { getMercadoPagoCredentials } = await import("@/lib/billing/mercado-pago-config.server");
    const { getMercadoPagoAccountId } = await import("@/lib/billing/mercado-pago.server");
    const credentials = await getMercadoPagoCredentials(data.environment);
    const actualAccountId = await getMercadoPagoAccountId(credentials);
    if (actualAccountId !== credentials.accountId)
      throw new Error("O User ID não pertence ao Access Token.");
    return { ok: true, accountId: actualAccountId };
  });
