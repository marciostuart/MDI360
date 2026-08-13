import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";

import { decryptCredential } from "@/lib/billing/mercado-pago-config.server";
import { getDb, schema } from "@/lib/db/index.server";

export const SMTP_SETTINGS_KEY = "smtp";

export type SmtpSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
};

type StoredSmtpSettings = Omit<SmtpSettings, "password"> & { password?: string };

export async function readStoredSmtpSettings(): Promise<StoredSmtpSettings | null> {
  const [row] = await getDb()
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, SMTP_SETTINGS_KEY))
    .limit(1);
  if (!row?.value || typeof row.value !== "object" || Array.isArray(row.value)) return null;
  return row.value as StoredSmtpSettings;
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const saved = await readStoredSmtpSettings();
  if (!saved) throw new Error("SMTP_NOT_CONFIGURED");
  const settings: SmtpSettings = {
    enabled: saved.enabled === true,
    host: String(saved.host ?? "").trim(),
    port: Number(saved.port ?? 587),
    secure: saved.secure === true,
    requireTls: saved.requireTls !== false,
    username: String(saved.username ?? "").trim(),
    password: decryptCredential(saved.password),
    fromName: String(saved.fromName ?? "MDI 360").trim(),
    fromEmail: String(saved.fromEmail ?? "").trim(),
    replyTo: String(saved.replyTo ?? "").trim(),
  };
  if (!settings.host || !settings.fromEmail || !settings.port)
    throw new Error("SMTP_NOT_CONFIGURED");
  return settings;
}

function transporter(settings: SmtpSettings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: settings.requireTls && !settings.secure,
    auth: settings.username ? { user: settings.username, pass: settings.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export async function verifySmtpConnection() {
  const settings = await getSmtpSettings();
  await transporter(settings).verify();
  return true;
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const settings = await getSmtpSettings();
  if (!settings.enabled) throw new Error("SMTP_DISABLED");
  const transport = transporter(settings);
  const info = await transport.sendMail({
    from: { name: settings.fromName || "MDI 360", address: settings.fromEmail },
    to: input.to,
    replyTo: settings.replyTo || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: { "X-Entity-Ref-ID": `mdi360-${Date.now()}` },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    messageId: info.messageId,
    accepted: info.accepted.map(String),
    rejected: info.rejected.map(String),
  };
}

export async function sendSmtpTest(recipient: string) {
  const settings = await getSmtpSettings();
  await transporter(settings).verify();
  const transport = transporter(settings);
  const info = await transport.sendMail({
    from: { name: settings.fromName || "MDI 360", address: settings.fromEmail },
    to: recipient,
    replyTo: settings.replyTo || undefined,
    subject: "Teste de e-mail — MDI 360",
    text: "A configuração SMTP do MDI 360 foi validada com sucesso.",
    html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>SMTP configurado com sucesso</h2><p>Esta mensagem confirma que o MDI 360 consegue enviar e-mails transacionais.</p><p style="color:#64748b;font-size:12px">Mensagem automática de teste da Torre de Controle.</p></div>',
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    messageId: info.messageId,
    accepted: info.accepted.map(String),
    rejected: info.rejected.map(String),
  };
}
