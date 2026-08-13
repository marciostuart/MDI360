import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/admin-auth.server";

const settingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  requireTls: z.boolean(),
  username: z.string().trim().max(320),
  password: z.string().max(1000),
  clearPassword: z.boolean().default(false),
  fromName: z.string().trim().min(1).max(120),
  fromEmail: z.string().trim().email().max(320),
  replyTo: z.union([z.literal(""), z.string().trim().email().max(320)]),
});

export type SmtpAdminInput = z.infer<typeof settingsSchema>;

export const fetchSmtpAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await requirePlatformAdmin();
  const { readStoredSmtpSettings } = await import("@/lib/notifications/smtp-config.server");
  const saved = await readStoredSmtpSettings();
  return {
    enabled: saved?.enabled === true,
    host: String(saved?.host ?? ""),
    port: Number(saved?.port ?? 587),
    secure: saved?.secure === true,
    requireTls: saved?.requireTls !== false,
    username: String(saved?.username ?? ""),
    passwordConfigured: Boolean(saved?.password),
    fromName: String(saved?.fromName ?? "MDI 360"),
    fromEmail: String(saved?.fromEmail ?? ""),
    replyTo: String(saved?.replyTo ?? ""),
  };
});

export const saveSmtpAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { encryptCredential } = await import("@/lib/billing/mercado-pago-config.server");
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { readStoredSmtpSettings, SMTP_SETTINGS_KEY } =
      await import("@/lib/notifications/smtp-config.server");
    const previous = await readStoredSmtpSettings();
    const value = {
      enabled: data.enabled,
      host: data.host,
      port: data.port,
      secure: data.secure,
      requireTls: data.requireTls,
      username: data.username,
      password: data.clearPassword
        ? ""
        : data.password
          ? encryptCredential(data.password)
          : String(previous?.password ?? ""),
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo,
    };
    await getDb()
      .insert(schema.platformSettings)
      .values({ key: SMTP_SETTINGS_KEY, value })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value, updatedAt: new Date() },
      });
    return { ok: true };
  });

export const verifySmtpAdmin = createServerFn({ method: "POST" }).handler(async () => {
  await requirePlatformAdmin();
  const { verifySmtpConnection } = await import("@/lib/notifications/smtp-config.server");
  await verifySmtpConnection();
  return { ok: true };
});

export const sendSmtpTestAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ recipient: z.string().trim().email().max(320) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { sendSmtpTest } = await import("@/lib/notifications/smtp-config.server");
    return sendSmtpTest(data.recipient);
  });
