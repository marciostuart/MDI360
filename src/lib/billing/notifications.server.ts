import { and, asc, eq, inArray, lt, lte, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { sendWhatsappText } from "@/lib/notifications/whatsapp.server";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export async function sendPendingBillingNotifications() {
  const db = getDb();
  const now = new Date();
  const staleClaim = new Date(now.getTime() - 10 * 60_000);
  const rows = await db
    .select({
      id: schema.billingNotifications.id,
      kind: schema.billingNotifications.kind,
      phone: schema.organizations.alertWhatsapp,
      phoneVerifiedAt: schema.organizations.alertWhatsappVerifiedAt,
      invoiceNumber: schema.billingInvoices.number,
      totalCents: schema.billingInvoices.totalCents,
      dueAt: schema.billingInvoices.dueAt,
      attempts: schema.billingNotifications.attempts,
    })
    .from(schema.billingNotifications)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.billingNotifications.organizationId),
    )
    .innerJoin(
      schema.billingInvoices,
      eq(schema.billingInvoices.id, schema.billingNotifications.invoiceId),
    )
    .where(
      and(
        or(
          and(
            inArray(schema.billingNotifications.status, ["pending", "failed"]),
            lte(schema.billingNotifications.nextAttemptAt, now),
          ),
          and(
            eq(schema.billingNotifications.status, "sending"),
            lt(schema.billingNotifications.processingAt, staleClaim),
          ),
        ),
        inArray(schema.billingInvoices.status, ["open", "overdue"]),
      ),
    )
    .orderBy(asc(schema.billingNotifications.createdAt))
    .limit(50);

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    // Atomic claim prevents duplicate WhatsApps when multiple server replicas run the scheduler.
    const claimed = await db
      .update(schema.billingNotifications)
      .set({ status: "sending", processingAt: new Date() })
      .where(
        and(
          eq(schema.billingNotifications.id, row.id),
          or(
            inArray(schema.billingNotifications.status, ["pending", "failed"]),
            and(
              eq(schema.billingNotifications.status, "sending"),
              lt(schema.billingNotifications.processingAt, staleClaim),
            ),
          ),
        ),
      )
      .returning({ id: schema.billingNotifications.id });
    if (!claimed.length) continue;

    if (!row.phone || !row.phoneVerifiedAt) {
      await markFailed(row.id, row.attempts, "WhatsApp da organização não confirmado", 6 * 60);
      failed += 1;
      continue;
    }

    const amount = money.format(row.totalCents / 100);
    const due = date.format(row.dueAt);
    const message =
      row.kind === "due"
        ? `MDI 360: a fatura ${row.invoiceNumber}, no valor de ${amount}, vence hoje (${due}). Acesse o painel para pagar.`
        : `MDI 360: sua fatura ${row.invoiceNumber}, no valor de ${amount}, está disponível e vence em ${due}. Acesse o painel para pagar.`;
    try {
      await sendWhatsappText(row.phone, message);
      await db
        .update(schema.billingNotifications)
        .set({
          status: "sent",
          recipient: row.phone,
          sentAt: new Date(),
          attempts: row.attempts + 1,
          processingAt: null,
          error: null,
        })
        .where(eq(schema.billingNotifications.id, row.id));
      sent += 1;
    } catch (error) {
      const retryMinutes = Math.min(360, 5 * 2 ** Math.min(row.attempts, 6));
      await markFailed(
        row.id,
        row.attempts,
        error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida",
        retryMinutes,
      );
      failed += 1;
    }
  }
  return { sent, failed };
}

async function markFailed(id: string, attempts: number, error: string, retryMinutes: number) {
  await getDb()
    .update(schema.billingNotifications)
    .set({
      status: "failed",
      attempts: attempts + 1,
      processingAt: null,
      nextAttemptAt: new Date(Date.now() + retryMinutes * 60_000),
      error,
    })
    .where(eq(schema.billingNotifications.id, id));
}
