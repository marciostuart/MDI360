import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { quizSchema, type PublicQuiz, type QuizConfig } from "./quiz";

export const fetchPublicQuiz = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicQuiz> => {
    const { readQuizConfig } = await import("./quiz.server");
    const { integrations: _private, ...quiz } = await readQuizConfig();
    return quiz;
  },
);
export const fetchQuizAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePlatformAdmin } = await import("@/lib/admin/admin-auth.server");
  await requirePlatformAdmin();
  const { readQuizConfig } = await import("./quiz.server");
  return readQuizConfig();
});
export const saveQuizAdmin = createServerFn({ method: "POST" })
  .validator(quizSchema)
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("@/lib/admin/admin-auth.server");
    await requirePlatformAdmin();
    const { readQuizConfig, webhookDestination } = await import("./quiz.server");
    if (data.integrations.webhookEnabled) await webhookDestination(data.integrations.webhookUrl);
    const { getDb, schema } = await import("@/lib/db/index.server");
    const previous = await readQuizConfig();
    const next = { ...data, revision: crypto.randomUUID() };
    const publicRevision = ({ integrations: _private, ...config }: QuizConfig) => config;
    await getDb().transaction(async (tx) => {
      // Preserve published questions for visitors already answering an older revision.
      await tx
        .insert(schema.platformSettings)
        .values({ key: `lead_quiz:${previous.revision}`, value: publicRevision(previous) })
        .onConflictDoNothing();
      await tx
        .insert(schema.platformSettings)
        .values({ key: `lead_quiz:${next.revision}`, value: publicRevision(next) });
      await tx
        .insert(schema.platformSettings)
        .values({ key: "lead_quiz", value: next })
        .onConflictDoUpdate({
          target: schema.platformSettings.key,
          set: { value: next, updatedAt: new Date() },
        });
    });
    return next;
  });
export const fetchQuizLeads = createServerFn({ method: "GET" })
  .validator(z.object({ page: z.number().int().min(0).max(10000) }))
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("@/lib/admin/admin-auth.server");
    await requirePlatformAdmin();
    const { listQuizLeads } = await import("./quiz.server");
    return listQuizLeads(data.page);
  });
export const retryQuizLead = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("@/lib/admin/admin-auth.server");
    await requirePlatformAdmin();
    const { dispatchQuizLead } = await import("./quiz.server");
    await dispatchQuizLead(data.id);
    return { ok: true };
  });
