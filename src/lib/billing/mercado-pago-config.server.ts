import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

export type MercadoPagoEnvironment = "test" | "production";

export type MercadoPagoCredentials = {
  environment: MercadoPagoEnvironment;
  publicKey: string;
  accessToken: string;
  applicationId: string;
  accountId: string;
  webhookSecret: string;
  liveMode: boolean;
};

type StoredProfile = {
  publicKey?: string;
  accessToken?: string;
  applicationId?: string;
  accountId?: string;
  webhookSecret?: string;
};

type StoredSettings = {
  activeEnvironment?: MercadoPagoEnvironment;
  test?: StoredProfile;
  production?: StoredProfile;
};

const SETTINGS_KEY = "mercado-pago";

function encryptionKey() {
  const secret = process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("CREDENTIALS_ENCRYPTION_KEY_NOT_CONFIGURED");
  return createHash("sha256").update(`mdi360:platform-credentials:${secret}`).digest();
}

export function encryptCredential(value: string) {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptCredential(value: string | undefined) {
  if (!value) return "";
  if (!value.startsWith("v1:")) return value;
  const [, iv, tag, encrypted] = value.split(":");
  if (!iv || !tag || !encrypted) throw new Error("INVALID_ENCRYPTED_CREDENTIAL");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function readStoredMercadoPagoSettings(): Promise<StoredSettings> {
  const [row] = await getDb()
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, SETTINGS_KEY))
    .limit(1);
  if (!row?.value || typeof row.value !== "object" || Array.isArray(row.value)) return {};
  return row.value as StoredSettings;
}

function envFallback(): MercadoPagoCredentials | null {
  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY ?? "";
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "";
  const accountId = process.env.MERCADO_PAGO_ACCOUNT_ID ?? "";
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "";
  if (!publicKey || !accessToken || !accountId) return null;
  const liveMode = process.env.MERCADO_PAGO_LIVE_MODE === "true";
  return {
    environment: liveMode ? "production" : "test",
    publicKey,
    accessToken,
    applicationId: "",
    accountId,
    webhookSecret,
    liveMode,
  };
}

export async function getMercadoPagoCredentials(
  environment?: MercadoPagoEnvironment,
): Promise<MercadoPagoCredentials> {
  const settings = await readStoredMercadoPagoSettings();
  const selected = environment ?? settings.activeEnvironment;
  if (!selected) {
    const fallback = envFallback();
    if (fallback) return fallback;
    throw new Error("MERCADO_PAGO_NOT_CONFIGURED");
  }
  const profile = settings[selected];
  if (!profile) throw new Error("MERCADO_PAGO_NOT_CONFIGURED");
  const credentials = {
    environment: selected,
    publicKey: String(profile.publicKey ?? "").trim(),
    accessToken: decryptCredential(profile.accessToken),
    applicationId: String(profile.applicationId ?? "").trim(),
    accountId: String(profile.accountId ?? "").trim(),
    webhookSecret: decryptCredential(profile.webhookSecret),
    liveMode: selected === "production",
  } satisfies MercadoPagoCredentials;
  if (!credentials.publicKey || !credentials.accessToken || !credentials.accountId) {
    throw new Error("MERCADO_PAGO_NOT_CONFIGURED");
  }
  return credentials;
}

export async function getConfiguredMercadoPagoCredentials() {
  const settings = await readStoredMercadoPagoSettings();
  const profiles: MercadoPagoCredentials[] = [];
  for (const environment of ["test", "production"] as const) {
    if (!settings[environment]) continue;
    try {
      profiles.push(await getMercadoPagoCredentials(environment));
    } catch {
      // An incomplete profile remains editable in Torre but cannot process payments.
    }
  }
  if (!profiles.length) {
    const fallback = envFallback();
    if (fallback) profiles.push(fallback);
  }
  return profiles;
}

export { SETTINGS_KEY as MERCADO_PAGO_SETTINGS_KEY };
