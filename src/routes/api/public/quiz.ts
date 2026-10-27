import { createFileRoute } from "@tanstack/react-router";
import { consolidateQuiz, quizSchema, submissionSchema } from "@/lib/landing/quiz";

export const Route = createFileRoute("/api/public/quiz")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (body: object, status = 200) =>
          Response.json(body, { status, headers: { "cache-control": "no-store" } });
        try {
          const origin = request.headers.get("origin");
          if (!origin || new URL(origin).host !== new URL(request.url).host)
            return json({ error: "Origem não autorizada." }, 403);
          if (!request.headers.get("content-type")?.startsWith("application/json"))
            return json({ error: "Formato inválido." }, 415);
          const reader = request.body?.getReader();
          if (!reader) return json({ error: "Dados ausentes." }, 400);
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 32_768) {
              await reader.cancel();
              return json({ error: "Envio muito grande." }, 413);
            }
            chunks.push(value);
          }
          const parsed = submissionSchema.safeParse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          );
          if (!parsed.success || parsed.data.website)
            return json({ error: "Revise os dados e tente novamente." }, 400);
          const data = parsed.data;
          const { readQuizConfig, dispatchQuizLead } = await import("@/lib/landing/quiz.server");
          const { getDb, schema } = await import("@/lib/db/index.server");
          const { and, count, eq, gte, or } = await import("drizzle-orm");
          const config = await readQuizConfig();
          if (!config.enabled)
            return json({ error: "O diagnóstico está temporariamente indisponível." }, 503);
          const db = getDb();
          const [version] =
            data.revision === config.revision
              ? [{ value: config }]
              : await db
                  .select()
                  .from(schema.platformSettings)
                  .where(eq(schema.platformSettings.key, `lead_quiz:${data.revision}`))
                  .limit(1);
          if (!version)
            return json(
              { error: "Este diagnóstico foi atualizado. Recarregue a página para continuar." },
              409,
            );
          const snapshot = quizSchema.parse({
            ...(version.value as object),
            integrations: config.integrations,
          });
          let result: ReturnType<typeof consolidateQuiz>;
          try {
            result = consolidateQuiz(snapshot, data.contact, data.answers);
          } catch {
            return json({ error: "Conclua as perguntas do diagnóstico antes de enviar." }, 400);
          }
          const [existing] = await db
            .select({ payload: schema.quizLeads.payload, revision: schema.quizLeads.revision })
            .from(schema.quizLeads)
            .where(eq(schema.quizLeads.id, data.id))
            .limit(1);
          const matches = (entry: typeof existing) =>
            entry &&
            entry.revision === data.revision &&
            Object.keys(entry.payload).length === Object.keys(result.payload).length &&
            Object.entries(result.payload).every(([key, value]) => entry.payload[key] === value);
          if (existing)
            return matches(existing)
              ? json({ ok: true, id: data.id })
              : json({ error: "Identificador de envio já utilizado." }, 409);
          const { createHash } = await import("node:crypto");
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128);
          const sourceHash = ip
            ? createHash("sha256")
                .update(
                  `${new Date().toISOString().slice(0, 10)}:${process.env.SESSION_SECRET ?? "mdi-quiz"}:${ip}`,
                )
                .digest("hex")
            : null;
          const [{ value: recent }] = await db
            .select({ value: count() })
            .from(schema.quizLeads)
            .where(
              and(
                gte(schema.quizLeads.createdAt, new Date(Date.now() - 3_600_000)),
                or(
                  eq(schema.quizLeads.whatsapp, data.contact.whatsapp),
                  ...(sourceHash ? [eq(schema.quizLeads.sourceHash, sourceHash)] : []),
                ),
              ),
            );
          if (recent >= 15)
            return json({ error: "Muitos envios recentes. Tente novamente mais tarde." }, 429);
          const inserted = await db
            .insert(schema.quizLeads)
            .values({
              id: data.id,
              revision: data.revision,
              nome: data.contact.nome,
              whatsapp: data.contact.whatsapp,
              email: data.contact.email,
              profile: result.payload.tipo_perfil,
              payload: result.payload,
              responses: result.responses,
              consentText: snapshot.consentText,
              sourceHash,
              whatsappStatus: config.integrations.whatsappEnabled ? "pending" : "disabled",
              webhookStatus: config.integrations.webhookEnabled ? "pending" : "disabled",
            })
            .onConflictDoNothing()
            .returning({ id: schema.quizLeads.id });
          if (!inserted.length) {
            const [raced] = await db
              .select({ payload: schema.quizLeads.payload, revision: schema.quizLeads.revision })
              .from(schema.quizLeads)
              .where(eq(schema.quizLeads.id, data.id))
              .limit(1);
            if (!matches(raced))
              return json({ error: "Identificador de envio já utilizado." }, 409);
          }
          // Node continues the two bounded requests after the persisted receipt.
          // A restart leaves pending/sending state for an explicit retry in the Torre.
          if (
            inserted.length &&
            (config.integrations.whatsappEnabled || config.integrations.webhookEnabled)
          )
            void dispatchQuizLead(data.id).catch(() =>
              console.error("[quiz] integrações pendentes; captura preservada"),
            );
          return json({ ok: true, id: data.id }, 202);
        } catch (error) {
          if (error instanceof SyntaxError) return json({ error: "JSON inválido." }, 400);
          console.error("[quiz] não foi possível concluir a captura");
          return json(
            {
              error:
                "Não foi possível salvar agora. Suas respostas continuam nesta página; tente novamente.",
            },
            503,
          );
        }
      },
    },
  },
});
