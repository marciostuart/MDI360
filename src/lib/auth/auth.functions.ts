import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido").max(254),
  password: z.string().min(8, "A senha precisa de ao menos 8 caracteres").max(200),
});

const signUpSchema = credentialsSchema.extend({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  organizationName: z.string().trim().min(2, "Informe o nome da empresa").max(160),
});

export type AuthResult = { ok: true } | { ok: false; message: string };

/** Returns the signed-in user, or null. Safe to call from public routes. */
export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const { isDatabaseConfigured } = await import("@/lib/db/index.server");
  if (!isDatabaseConfigured()) return null;

  const { getSessionUser } = await import("@/lib/auth/session.server");
  try {
    return await getSessionUser();
  } catch (error) {
    console.error("fetchCurrentUser failed", error);
    return null;
  }
});

/**
 * Minimal, public-safe signal used by the sign-in page. Infrastructure details
 * (storage errors, schema state) are platform-staff only and live in
 * fetchInfraStatus — never expose them to customers.
 */
export const fetchSetupState = createServerFn({ method: "GET" }).handler(async () => {
  const { isDatabaseConfigured } = await import("@/lib/db/index.server");
  return { databaseReady: isDatabaseConfigured() };
});

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signUpSchema.parse(input))
  .handler(async ({ data }): Promise<AuthResult> => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) {
      return { ok: false, message: "Banco de dados ainda não configurado." };
    }

    const { hashPassword, createSession } = await import("@/lib/auth/session.server");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    try {
      const existing = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, data.email))
        .limit(1);

      if (existing.length > 0) {
        return { ok: false, message: "Este e-mail já está cadastrado." };
      }

      const slugBase =
        data.organizationName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 40) || "empresa";

      const userId = await db.transaction(async (tx) => {
        // New self-service accounts start on the restricted free plan
        // (1 screen, 4 GB, no queue add-on). Created on demand so a fresh
        // database always has it available.
        const existingPlan = await tx
          .select({ id: schema.plans.id })
          .from(schema.plans)
          .where(eq(schema.plans.slug, "gratuito"))
          .limit(1);

        let freePlanId = existingPlan[0]?.id ?? null;
        if (!freePlanId) {
          const [created] = await tx
            .insert(schema.plans)
            .values({
              name: "Gratuito",
              slug: "gratuito",
              maxDevices: 1,
              maxStorageMb: 4096,
              priceCents: 0,
              queueEnabled: false,
              isActive: true,
            })
            .returning({ id: schema.plans.id });
          freePlanId = created?.id ?? null;
        }

        const [org] = await tx
          .insert(schema.organizations)
          .values({
            name: data.organizationName,
            slug: `${slugBase}-${Date.now().toString(36)}`,
            planId: freePlanId,
          })
          .returning({ id: schema.organizations.id });

        const [user] = await tx
          .insert(schema.users)
          .values({
            organizationId: org.id,
            email: data.email,
            name: data.name,
            passwordHash: await hashPassword(data.password),
          })
          .returning({ id: schema.users.id });

        // First user of a new organization owns it.
        await tx.insert(schema.userRoles).values({ userId: user.id, role: "owner" });
        return user.id;
      });

      await createSession(userId);
      return { ok: true };
    } catch (error) {
      console.error("signUp failed", error);
      return { ok: false, message: "Não foi possível criar a conta. Tente novamente." };
    }
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentialsSchema.parse(input))
  .handler(async ({ data }): Promise<AuthResult> => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) {
      return { ok: false, message: "Banco de dados ainda não configurado." };
    }

    const { verifyPassword, createSession } = await import("@/lib/auth/session.server");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    // Same generic message for unknown e-mail and wrong password.
    const invalid: AuthResult = { ok: false, message: "E-mail ou senha incorretos." };

    try {
      const [user] = await db
        .select({
          id: schema.users.id,
          passwordHash: schema.users.passwordHash,
          isActive: schema.users.isActive,
        })
        .from(schema.users)
        .where(eq(schema.users.email, data.email))
        .limit(1);

      if (!user || !user.isActive) return invalid;
      if (!(await verifyPassword(data.password, user.passwordHash))) return invalid;

      await db
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id));

      await createSession(user.id);
      return { ok: true };
    } catch (error) {
      console.error("signIn failed", error);
      return { ok: false, message: "Não foi possível entrar. Tente novamente." };
    }
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { isDatabaseConfigured } = await import("@/lib/db/index.server");
  if (!isDatabaseConfigured()) return { ok: true };

  const { destroySession } = await import("@/lib/auth/session.server");
  try {
    await destroySession();
  } catch (error) {
    console.error("signOut failed", error);
  }
  return { ok: true };
});