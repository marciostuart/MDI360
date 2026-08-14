import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  customerProfileSchema,
  profileIsComplete,
  type CustomerProfileInput,
} from "@/lib/billing/customer-profile";

export const fetchCustomerProfile = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("@/lib/auth/session.server");
  const { getDb, schema } = await import("@/lib/db/index.server");
  const user = await requireUser({ allowSuspended: true });
  const [profile] = await getDb()
    .select()
    .from(schema.billingProfiles)
    .where(eq(schema.billingProfiles.organizationId, user.organizationId))
    .limit(1);
  return {
    profile: profile ?? null,
    complete: profileIsComplete(profile),
    email: user.email,
    organizationName: user.organizationName,
  };
});

export const saveCustomerProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => customerProfileSchema.parse(input))
  .handler(async ({ data }: { data: CustomerProfileInput }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { getDb, schema } = await import("@/lib/db/index.server");
    const user = await requireUser({ allowSuspended: true });
    if (!user.roles.some((role) => role === "owner" || role === "admin")) {
      throw new Error("FORBIDDEN");
    }
    const now = new Date();
    await getDb()
      .insert(schema.billingProfiles)
      .values({ organizationId: user.organizationId, ...data, completedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.billingProfiles.organizationId,
        set: { ...data, completedAt: now, updatedAt: now },
      });
    return { ok: true, complete: true };
  });

export const lookupAddressByCep = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        cep: z
          .string()
          .transform((value) => value.replace(/\D/g, ""))
          .pipe(z.string().length(8)),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    await requireUser({ allowSuspended: true });
    const response = await fetch(`https://viacep.com.br/ws/${data.cep}/json/`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("CEP_LOOKUP_FAILED");
    const payload = (await response.json()) as Record<string, unknown>;
    if (payload.erro === true) throw new Error("CEP_NOT_FOUND");
    return {
      zipCode: String(payload.cep ?? data.cep).replace(/\D/g, ""),
      street: String(payload.logradouro ?? "").trim(),
      complement: String(payload.complemento ?? "").trim(),
      neighborhood: String(payload.bairro ?? "").trim(),
      city: String(payload.localidade ?? "").trim(),
      state: String(payload.uf ?? "")
        .trim()
        .toUpperCase(),
    };
  });
