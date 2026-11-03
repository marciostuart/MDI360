import { eq } from "drizzle-orm";

import { decryptCredential, encryptCredential } from "@/lib/billing/mercado-pago-config.server";
import { getDb, schema } from "@/lib/db/index.server";

const SETTINGS_KEY = "pay-360bh";
const DEFAULT_API_URL = "https://pay.360bh.com.br";

type StoredConfig = {
  apiUrl?: string;
  projectCode?: string;
  serviceKey?: string;
  notificationToken?: string;
};

function safeObject(value: unknown): StoredConfig {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as StoredConfig) : {};
}

export type Pay360BhCredentials = {
  apiUrl: string;
  projectCode: string;
  serviceKey: string;
  notificationToken: string;
};

export async function readPay360BhSettings() {
  const [row] = await getDb()
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, SETTINGS_KEY))
    .limit(1);
  return safeObject(row?.value);
}

export async function getPay360BhCredentials(): Promise<Pay360BhCredentials> {
  const saved = await readPay360BhSettings();
  const credentials = {
    apiUrl: String(saved.apiUrl || DEFAULT_API_URL).replace(/\/$/, ""),
    projectCode: String(saved.projectCode ?? "").trim(),
    serviceKey: decryptCredential(String(saved.serviceKey ?? "")),
    notificationToken: decryptCredential(String(saved.notificationToken ?? "")),
  };
  if (!credentials.projectCode || !credentials.serviceKey || !credentials.notificationToken) {
    throw new Error("PAY360BH_NOT_CONFIGURED");
  }
  const apiUrl = new URL(credentials.apiUrl);
  if (apiUrl.protocol !== "https:" || apiUrl.hostname !== "pay.360bh.com.br") {
    throw new Error("PAY360BH_INVALID_API_URL");
  }
  return credentials;
}

export async function savePay360BhSettings(input: {
  projectCode: string;
  serviceKey: string;
  notificationToken: string;
  clearServiceKey: boolean;
  clearNotificationToken: boolean;
}) {
  const previous = await readPay360BhSettings();
  const value = {
    apiUrl: DEFAULT_API_URL,
    projectCode: input.projectCode.trim(),
    serviceKey: input.clearServiceKey
      ? ""
      : input.serviceKey
        ? encryptCredential(input.serviceKey.trim())
        : String(previous.serviceKey ?? ""),
    notificationToken: input.clearNotificationToken
      ? ""
      : input.notificationToken
        ? encryptCredential(input.notificationToken.trim())
        : String(previous.notificationToken ?? ""),
  };
  await getDb()
    .insert(schema.platformSettings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({
      target: schema.platformSettings.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}

export async function pay360BhStatus() {
  const saved = await readPay360BhSettings();
  const serviceKeyConfigured = Boolean(saved.serviceKey);
  const notificationTokenConfigured = Boolean(saved.notificationToken);
  return {
    apiUrl: String(saved.apiUrl || DEFAULT_API_URL),
    projectCode: String(saved.projectCode ?? ""),
    serviceKeyConfigured,
    notificationTokenConfigured,
    ready: Boolean(saved.projectCode && serviceKeyConfigured && notificationTokenConfigured),
  };
}
