import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const fail = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
const phoneDigits = (v: string) => v.replace(/\D/g, "");
const inputSchema = z.object({
  action: z.literal("request"),
  type: z.enum(["PF", "PJ"]),
  name: z.string().trim().min(3).max(160),
  cpf: z.string().optional(),
  cnpj: z.string().optional(),
  fantasyName: z.string().optional(),
  responsible: z.string().trim().min(3).max(160),
  phone: z.string().transform(phoneDigits).pipe(z.string().min(10).max(11)),
  email: z.string().trim().toLowerCase().email().max(254),
  cep: z.string().transform(phoneDigits).pipe(z.string().length(8)),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(30),
  complement: z.string().max(100).default(""),
  neighborhood: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().toUpperCase().length(2),
  turnstileToken: z.string().min(1).max(2048),
  website: z.string().max(200).default(""),
  traffic: z.record(z.string().max(500)).default({}),
});
const confirmSchema = z.object({
  action: z.literal("confirm"),
  token: z.string().min(32).max(200),
  password: z.string().min(8).max(200),
});
async function clientAddress(request: Request) {
  const address =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  return address && (await import("node:net")).isIP(address) ? address : null;
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("BAD_CONTENT");
  const text = await request.text();
  if (text.length > 24_000) throw new Error("TOO_LARGE");
  return JSON.parse(text);
}
export const Route = createFileRoute("/api/public/signup")({
  server: {
    handlers: {
      GET: async () => {
        const { getTurnstileConfig } = await import("@/lib/auth/turnstile.server");
        const config = getTurnstileConfig();
        return Response.json(
          { siteKey: config.siteKey || null },
          { headers: { "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        try {
          const origin = request.headers.get("origin");
          if (!origin || new URL(origin).host !== new URL(request.url).host)
            return fail(403, "Origem não autorizada.");
          const raw = await body(request);
          if (raw?.action === "request") {
            const p = inputSchema.safeParse(raw);
            if (!p.success || p.data.website) return fail(400, "Revise os dados informados.");
            const data = p.data;
            const { isValidCpf, isValidCnpj } = await import("@/lib/billing/customer-profile");
            const document = data.type === "PF" ? (data.cpf ?? "") : (data.cnpj ?? "");
            if (!(data.type === "PF" ? isValidCpf(document) : isValidCnpj(document)))
              return fail(400, "CPF ou CNPJ inválido.");
            const { getTurnstileConfig, verifyTurnstileToken } =
              await import("@/lib/auth/turnstile.server");
            if (
              !getTurnstileConfig().enabled ||
              !(await verifyTurnstileToken(data.turnstileToken, "signup_preregister"))
            )
              return fail(503, "Validação de segurança indisponível. Tente novamente mais tarde.");
            const { getDb, schema } = await import("@/lib/db/index.server");
            const { and, eq, gt, gte } = await import("drizzle-orm");
            const db = getDb();
            const address = await clientAddress(request);
            if (!address) return fail(400, "Não foi possível validar a conexão. Tente novamente.");
            const { signupBinding, signupDigest, encryptSignupPayload } =
              await import("@/lib/landing/signup-crypto.server");
            const ipHash = signupBinding(address);
            const ua = request.headers.get("user-agent") ?? "";
            if (!ua) return fail(400, "Navegador inválido.");
            const { count } = await import("drizzle-orm");
            const [recent] = await db
              .select({ count: count() })
              .from(schema.signupRequests)
              .where(
                and(
                  eq(schema.signupRequests.ipHash, ipHash),
                  gte(schema.signupRequests.createdAt, new Date(Date.now() - 3600_000)),
                ),
              );
            if ((recent?.count ?? 0) >= 5)
              return fail(429, "Muitas solicitações. Aguarde antes de tentar novamente.");
            const { randomBytes } = await import("node:crypto");
            const token = randomBytes(32).toString("base64url");
            const id = crypto.randomUUID();
            const { turnstileToken: _challenge, website: _trap, ...withoutSecurityFields } = data;
            const clean = {
              ...withoutSecurityFields,
              document: phoneDigits(document),
              traffic: data.traffic,
            };
            await db.insert(schema.signupRequests).values({
              id,
              email: data.email,
              tokenHash: signupDigest(token),
              payloadEncrypted: encryptSignupPayload(clean),
              ipHash,
              userAgentHash: signupBinding(ua),
              expiresAt: new Date(Date.now() + 10 * 60_000),
            });
            const { sendTransactionalEmail } =
              await import("@/lib/notifications/smtp-config.server");
            const link = `${new URL(request.url).origin}/cadastro?confirm=${encodeURIComponent(token)}`;
            try {
              await sendTransactionalEmail({
                to: data.email,
                subject: "Confirme seu pré-cadastro MDI 360",
                text: `Confirme seu e-mail em até 10 minutos: ${link}\nO link só funciona neste navegador e nesta conexão.`,
                html: `<p>Para concluir seu pré-cadastro no MDI 360, confirme seu e-mail em até 10 minutos.</p><p><a href="${link}">Confirmar e continuar</a></p><p>O link funciona apenas no mesmo navegador e conexão usados no cadastro.</p>`,
              });
            } catch (error) {
              await db.delete(schema.signupRequests).where(eq(schema.signupRequests.id, id));
              console.error(
                "public signup email delivery failed",
                error instanceof Error ? error.message : "unknown error",
              );
              throw new Error("SIGNUP_EMAIL_DELIVERY_FAILED");
            }
            return Response.json(
              { ok: true },
              { status: 202, headers: { "cache-control": "no-store" } },
            );
          }
          const p = confirmSchema.safeParse(raw);
          if (!p.success) return fail(400, "Link ou senha inválidos.");
          const { getDb, schema } = await import("@/lib/db/index.server");
          const { and, eq, gt, isNull, or } = await import("drizzle-orm");
          const db = getDb();
          const { signupBindingCandidates, signupDigest, decryptSignupPayload } =
            await import("@/lib/landing/signup-crypto.server");
          const address = await clientAddress(request);
          if (!address) return fail(400, "Não foi possível validar a conexão.");
          const ipHashes = signupBindingCandidates(address);
          const uaHashes = signupBindingCandidates(request.headers.get("user-agent") ?? "");
          const bindings = ipHashes.map((ipHash, index) =>
            and(
              eq(schema.signupRequests.ipHash, ipHash),
              eq(schema.signupRequests.userAgentHash, uaHashes[index]!),
            ),
          );
          let lead: Record<string, unknown> | null = null;
          let signupId = "";
          const accountId = await db.transaction(async (tx) => {
            const [row] = await tx
              .select()
              .from(schema.signupRequests)
              .where(
                and(
                  eq(schema.signupRequests.tokenHash, signupDigest(p.data.token)),
                  or(...bindings),
                  gt(schema.signupRequests.expiresAt, new Date()),
                  isNull(schema.signupRequests.usedAt),
                ),
              )
              .limit(1);
            if (!row) throw new Error("INVALID_LINK");
            const data = decryptSignupPayload(row.payloadEncrypted) as z.infer<
              typeof inputSchema
            > & { document: string };
            const [existing] = await tx
              .select({ id: schema.users.id })
              .from(schema.users)
              .where(eq(schema.users.email, data.email))
              .limit(1);
            if (existing) throw new Error("EMAIL_EXISTS");
            const claimed = await tx
              .update(schema.signupRequests)
              .set({ usedAt: new Date(), webhookStatus: "pending" })
              .where(
                and(eq(schema.signupRequests.id, row.id), isNull(schema.signupRequests.usedAt)),
              )
              .returning({ id: schema.signupRequests.id });
            if (!claimed.length) throw new Error("INVALID_LINK");
            let [plan] = await tx
              .select({ id: schema.plans.id })
              .from(schema.plans)
              .where(eq(schema.plans.slug, "gratuito"))
              .limit(1);
            if (!plan)
              [plan] = await tx
                .insert(schema.plans)
                .values({
                  name: "Gratuito",
                  slug: "gratuito",
                  maxDevices: 1,
                  maxStorageMb: 4096,
                  priceCents: 0,
                  queueEnabled: false,
                })
                .returning({ id: schema.plans.id });
            const company = data.type === "PJ" ? data.fantasyName?.trim() || data.name : data.name;
            const slug = `${
              company
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
                .slice(0, 35) || "empresa"
            }-${randomBytes(4).toString("hex")}`;
            const [org] = await tx
              .insert(schema.organizations)
              .values({ name: company, slug, planId: plan!.id, subscriptionStatus: "active" })
              .returning({ id: schema.organizations.id });
            const { hashPassword } = await import("@/lib/auth/session.server");
            const [user] = await tx
              .insert(schema.users)
              .values({
                organizationId: org!.id,
                email: data.email,
                name: data.responsible,
                passwordHash: await hashPassword(p.data.password),
              })
              .returning({ id: schema.users.id });
            await tx.insert(schema.userRoles).values({ userId: user!.id, role: "owner" });
            await tx.insert(schema.billingProfiles).values({
              organizationId: org!.id,
              legalName: data.type === "PF" ? data.name : data.name,
              documentType: data.type === "PF" ? "CPF" : "CNPJ",
              documentNumber: data.document,
              phone: data.phone,
              zipCode: data.cep,
              street: data.street,
              number: data.number,
              complement: data.complement,
              neighborhood: data.neighborhood,
              city: data.city,
              state: data.state,
              completedAt: new Date(),
            });
            signupId = row.id;
            lead = {
              nome: data.name,
              razao_social: data.type === "PJ" ? data.name : "",
              nome_fantasia: data.fantasyName ?? "",
              responsavel: data.responsible,
              cpf: data.type === "PF" ? data.document : "",
              cnpj: data.type === "PJ" ? data.document : "",
              telefone: data.phone,
              email: data.email,
              cep: data.cep,
              rua: data.street,
              numero: data.number,
              complemento: data.complement,
              bairro: data.neighborhood,
              cidade: data.city,
              estado: data.state,
              tipo_pessoa: data.type === "PF" ? "Pessoa Física" : "Pessoa Jurídica",
              origem_trafego: data.traffic,
            };
            return user!.id;
          });
          const { createSession } = await import("@/lib/auth/session.server");
          await createSession(accountId);
          try {
            const [config] = await db
              .select({ value: schema.platformSettings.value })
              .from(schema.platformSettings)
              .where(eq(schema.platformSettings.key, "signup_webhook"))
              .limit(1);
            const webhook = config?.value as { enabled?: boolean; url?: string } | undefined;
            if (webhook?.enabled && webhook.url) {
              const { sendSignupWebhook } = await import("@/lib/landing/signup-webhook.server");
              await sendSignupWebhook(webhook.url, lead!, signupId);
              await db
                .update(schema.signupRequests)
                .set({ webhookStatus: "sent" })
                .where(eq(schema.signupRequests.id, signupId));
            } else
              await db
                .update(schema.signupRequests)
                .set({ webhookStatus: "disabled" })
                .where(eq(schema.signupRequests.id, signupId));
          } catch {
            await db
              .update(schema.signupRequests)
              .set({ webhookStatus: "failed" })
              .where(eq(schema.signupRequests.id, signupId));
          }
          return Response.json(
            { ok: true, redirect: "/studio" },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "BAD_CONTENT" || message === "TOO_LARGE")
            return fail(400, "Requisição inválida.");
          if (message === "INVALID_LINK")
            return fail(400, "Link expirado, já utilizado ou aberto em outra conexão/navegador.");
          if (message === "EMAIL_EXISTS" || message.includes("SMTP_"))
            return fail(409, "Não foi possível concluir. Verifique o e-mail ou tente novamente.");
          if (message === "SIGNUP_EMAIL_DELIVERY_FAILED")
            return fail(
              503,
              "Não foi possível enviar o e-mail de confirmação. Verifique o serviço SMTP.",
            );
          if (message === "SESSION_SECRET_INVALID" || message === "SIGNUP_DATA_SECRET_INVALID")
            return fail(
              503,
              "Configuração de segurança do cadastro inválida. Configure SIGNUP_DATA_SECRET na Stack.",
            );
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error.code === "42P01" || error.code === "42703")
          )
            return fail(
              503,
              "Migração do banco do cadastro pendente. A equipe deve revisar as migrações.",
            );
          console.error("public signup failed", message);
          return fail(503, "Não foi possível concluir agora. Tente novamente.");
        }
      },
    },
  },
});
