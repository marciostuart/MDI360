import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { getDb, schema, isDatabaseConfigured } from "@/lib/db/index.server";
import { sendWhatsappText } from "@/lib/notifications/whatsapp.server";
import { DEFAULT_QUIZ, quizSchema, type QuizConfig, type LeadPayload } from "./quiz";
import { dispararWebhook } from "./quiz-webhook.server";
export { dispararWebhook, webhookDestination } from "./quiz-webhook.server";

export async function readQuizConfig(): Promise<QuizConfig> {
  if (!isDatabaseConfigured()) return DEFAULT_QUIZ;
  const [row] = await getDb()
    .select()
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, "lead_quiz"))
    .limit(1);
  return row ? quizSchema.parse(row.value) : DEFAULT_QUIZ;
}

export async function enviarParaWhatsApp(
  dados: LeadPayload,
  integrations: QuizConfig["integrations"],
) {
  const labels: Record<string, string> = {
    nome: "Nome",
    whatsapp: "WhatsApp",
    email: "E-mail",
    tipo_perfil: "Perfil",
    nicho_ou_atuacao: "Segmento / atuação",
    quantidade_telas_meta: "Telas / meta",
    crm_atual: "CRM / fidelidade",
  };
  await sendWhatsappText(
    integrations.whatsappRecipient,
    `Novo diagnóstico MDI 360\n\n${Object.entries(dados)
      .map(([key, value]) => `${labels[key] ?? key}: ${value}`)
      .join("\n")}`,
  );
}

/** Each channel is claimed atomically; retries never resend a successful one. */
export async function dispatchQuizLead(id: string) {
  const config = await readQuizConfig();
  const db = getDb();
  const table = schema.quizLeads;
  await Promise.allSettled(
    (["whatsapp", "webhook"] as const).map(async (channel) => {
      const status = channel === "whatsapp" ? table.whatsappStatus : table.webhookStatus;
      const attempted =
        channel === "whatsapp" ? table.whatsappAttemptedAt : table.webhookAttemptedAt;
      const statusKey = channel === "whatsapp" ? "whatsappStatus" : "webhookStatus";
      const errorKey = channel === "whatsapp" ? "whatsappError" : "webhookError";
      const timeKey = channel === "whatsapp" ? "whatsappAttemptedAt" : "webhookAttemptedAt";
      const enabled =
        channel === "whatsapp"
          ? config.integrations.whatsappEnabled
          : config.integrations.webhookEnabled;
      const [row] = await db
        .update(table)
        .set({
          [statusKey]: enabled ? "sending" : "disabled",
          [timeKey]: new Date(),
          [errorKey]: null,
        })
        .where(
          and(
            eq(table.id, id),
            or(
              inArray(status, ["pending", "failed"]),
              and(eq(status, "sending"), lt(attempted, new Date(Date.now() - 5 * 60_000))),
            ),
          ),
        )
        .returning();
      if (!row || !enabled) return;
      try {
        if (channel === "whatsapp") await enviarParaWhatsApp(row.payload, config.integrations);
        else await dispararWebhook(row.payload, config.integrations, row.id);
        await db
          .update(table)
          .set({ [statusKey]: "sent", [errorKey]: null })
          .where(eq(table.id, id));
      } catch (error) {
        // Never store URLs, keys or response bodies in delivery errors.
        const message =
          error instanceof Error &&
          /(?:HTTP \d{3}|Evolution API n.o configurada|servidor p.blico|HTTPS|Tempo limite)/.test(
            error.message,
          )
            ? error.message.slice(0, 160)
            : "Falha de conexão com a integração. Verifique a configuração e tente novamente.";
        await db
          .update(table)
          .set({ [statusKey]: "failed", [errorKey]: message })
          .where(eq(table.id, id));
      }
    }),
  );
}

export async function listQuizLeads(page: number) {
  const rows = await getDb()
    .select()
    .from(schema.quizLeads)
    .orderBy(desc(schema.quizLeads.createdAt), desc(schema.quizLeads.id))
    .limit(26)
    .offset(page * 25);
  return {
    rows: rows.slice(0, 25).map(({ sourceHash: _private, ...row }) => row),
    hasNext: rows.length > 25,
  };
}
