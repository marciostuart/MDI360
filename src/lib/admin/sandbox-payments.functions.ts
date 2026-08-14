import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/admin-auth.server";

const cardSchema = z.object({
  token: z.string().min(1).max(500),
  paymentMethodId: z.string().min(1).max(80),
  documentType: z.string().max(20).optional(),
  documentNumber: z.string().max(30).optional(),
});

const createSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("pix"), amountCents: z.number().int().min(100).max(100_000) }),
  z.object({ method: z.literal("boleto"), amountCents: z.number().int().min(100).max(100_000) }),
  z.object({
    method: z.literal("card"),
    amountCents: z.number().int().min(100).max(100_000),
    card: cardSchema,
  }),
]);

export type CreateSandboxPaymentInput = z.infer<typeof createSchema>;

export const fetchSandboxPayments = createServerFn({ method: "GET" }).handler(async () => {
  await requirePlatformAdmin();
  const { getMercadoPagoCredentials } = await import("@/lib/billing/mercado-pago-config.server");
  const { listSandboxTests } = await import("@/lib/billing/sandbox-payments.server");
  const credentials = await getMercadoPagoCredentials("test");
  return { publicKey: credentials.publicKey, tests: await listSandboxTests() };
});

export const createSandboxPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requirePlatformAdmin();
    const { createSandboxTest } = await import("@/lib/billing/sandbox-payments.server");
    return createSandboxTest({ ...data, createdByUserId: user.id });
  });

const idSchema = z.object({ id: z.string().uuid() });

export const refreshSandboxPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { refreshSandboxTest } = await import("@/lib/billing/sandbox-payments.server");
    return refreshSandboxTest(data.id);
  });

export const cancelSandboxPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { cancelSandboxTest } = await import("@/lib/billing/sandbox-payments.server");
    return cancelSandboxTest(data.id);
  });
