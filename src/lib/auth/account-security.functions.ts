import { createHash, randomBytes } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/lib/db/index.server";

const emailSchema = z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254);
const passwordSchema = z.string().min(8, "Use pelo menos 8 caracteres.").max(200);
const tokenSchema = z.string().min(40).max(200);

function newActionToken() {
  return randomBytes(32).toString("base64url");
}

function hashActionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl() {
  return (process.env.APP_URL || "https://mdi.360bh.com.br").replace(/\/$/, "");
}

function emailHtml(title: string, message: string, button: string, url: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>${title}</h2><p>${message}</p><p style="margin:28px 0"><a href="${url}" style="background:#8ee548;color:#101820;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">${button}</a></p><p style="font-size:12px;color:#64748b">Se você não solicitou esta alteração, ignore esta mensagem. O link expira automaticamente.</p></div>`;
}

async function issueToken(userId: string, purpose: "password_reset" | "email_change", pendingEmail?: string) {
  const db = getDb();
  const raw = newActionToken();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.accountActionTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.accountActionTokens.userId, userId),
          eq(schema.accountActionTokens.purpose, purpose),
          isNull(schema.accountActionTokens.usedAt),
        ),
      );
    await tx.insert(schema.accountActionTokens).values({
      userId,
      purpose,
      tokenHash: hashActionToken(raw),
      pendingEmail,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
  });
  return raw;
}

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: emailSchema, turnstileToken: z.string().max(2048).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const neutral = {
      ok: true as const,
      message: "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.",
    };
    const { verifyTurnstileToken } = await import("@/lib/auth/turnstile.server");
    if (!(await verifyTurnstileToken(data.turnstileToken, "password_reset"))) {
      return { ok: false as const, message: "Confirme a verificação de segurança." };
    }
    const [user] = await getDb()
      .select({ id: schema.users.id, email: schema.users.email, isActive: schema.users.isActive })
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);
    if (!user?.isActive) return neutral;

    try {
      const token = await issueToken(user.id, "password_reset");
      const url = `${appUrl()}/redefinir-senha/${encodeURIComponent(token)}`;
      const { sendTransactionalEmail } = await import("@/lib/notifications/smtp-config.server");
      await sendTransactionalEmail({
        to: user.email,
        subject: "Recuperação de senha — MDI 360",
        text: `Use este link para definir uma nova senha: ${url}\nO link expira em 30 minutos.`,
        html: emailHtml(
          "Recuperação de senha",
          "Recebemos uma solicitação para definir uma nova senha da sua conta MDI 360. O link é válido por 30 minutos e pode ser usado uma única vez.",
          "Definir nova senha",
          url,
        ),
      });
    } catch (error) {
      console.error("requestPasswordReset failed", error);
    }
    return neutral;
  });

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tokenSchema, password: passwordSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { hashPassword } = await import("@/lib/auth/session.server");
    const passwordHash = await hashPassword(data.password);
    const db = getDb();
    const [record] = await db
      .select({ id: schema.accountActionTokens.id, userId: schema.accountActionTokens.userId })
      .from(schema.accountActionTokens)
      .where(
        and(
          eq(schema.accountActionTokens.tokenHash, hashActionToken(data.token)),
          eq(schema.accountActionTokens.purpose, "password_reset"),
          isNull(schema.accountActionTokens.usedAt),
          gt(schema.accountActionTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!record) return { ok: false as const, message: "Este link é inválido ou expirou." };

    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(schema.accountActionTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(schema.accountActionTokens.id, record.id), isNull(schema.accountActionTokens.usedAt)))
        .returning({ id: schema.accountActionTokens.id });
      if (!claimed.length) throw new Error("TOKEN_ALREADY_USED");
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, record.userId));
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, record.userId));
    });
    return { ok: true as const };
  });

export const requestEmailChange = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: emailSchema }).parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const user = await requireUser({ allowSuspended: true });
    if (data.email === user.email.toLowerCase()) {
      return { ok: false as const, message: "Este já é o seu e-mail de acesso." };
    }
    const [existing] = await getDb()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);
    if (existing) return { ok: false as const, message: "Este e-mail já está em uso." };

    const token = await issueToken(user.id, "email_change", data.email);
    const url = `${appUrl()}/confirmar-email/${encodeURIComponent(token)}`;
    const { sendTransactionalEmail } = await import("@/lib/notifications/smtp-config.server");
    await sendTransactionalEmail({
      to: data.email,
      subject: "Confirme seu novo e-mail — MDI 360",
      text: `Confirme seu novo e-mail acessando: ${url}\nO link expira em 30 minutos.`,
      html: emailHtml(
        "Confirme seu novo e-mail",
        "Clique abaixo para confirmar este endereço como o novo e-mail de acesso à sua conta MDI 360.",
        "Confirmar novo e-mail",
        url,
      ),
    });
    return { ok: true as const, message: "Enviamos uma confirmação para o novo e-mail." };
  });

export const confirmEmailChange = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const db = getDb();
    const [record] = await db
      .select({
        id: schema.accountActionTokens.id,
        userId: schema.accountActionTokens.userId,
        pendingEmail: schema.accountActionTokens.pendingEmail,
      })
      .from(schema.accountActionTokens)
      .where(
        and(
          eq(schema.accountActionTokens.tokenHash, hashActionToken(data.token)),
          eq(schema.accountActionTokens.purpose, "email_change"),
          isNull(schema.accountActionTokens.usedAt),
          gt(schema.accountActionTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!record?.pendingEmail) {
      return { ok: false as const, message: "Este link é inválido ou expirou." };
    }
    const email = emailSchema.parse(record.pendingEmail);
    try {
      await db.transaction(async (tx) => {
        const claimed = await tx
          .update(schema.accountActionTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(schema.accountActionTokens.id, record.id), isNull(schema.accountActionTokens.usedAt)))
          .returning({ id: schema.accountActionTokens.id });
        if (!claimed.length) throw new Error("TOKEN_ALREADY_USED");
        await tx.update(schema.users).set({ email }).where(eq(schema.users.id, record.userId));
        await tx.delete(schema.sessions).where(eq(schema.sessions.userId, record.userId));
      });
      return { ok: true as const, message: "E-mail confirmado. Entre novamente com o novo endereço." };
    } catch (error) {
      console.error("confirmEmailChange failed", error);
      return { ok: false as const, message: "Não foi possível confirmar. O e-mail pode já estar em uso." };
    }
  });
