import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/admin-auth.server";

const inputSchema = z.object({
  projectCode: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/),
  serviceKey: z.string().trim().max(1000),
  notificationToken: z.string().trim().max(1000),
  clearServiceKey: z.boolean(),
  clearNotificationToken: z.boolean(),
});

export type Pay360BhAdminInput = z.infer<typeof inputSchema>;

export const fetchPay360BhAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await requirePlatformAdmin();
  const { pay360BhStatus } = await import("@/lib/billing/pay360bh-config.server");
  const appUrl = (process.env.APP_URL || "https://mdi.360bh.com.br").replace(/\/$/, "");
  return { ...(await pay360BhStatus()), webhookUrl: `${appUrl}/api/public/pay360bh/webhook` };
});

export const savePay360BhAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    const { savePay360BhSettings } = await import("@/lib/billing/pay360bh-config.server");
    await savePay360BhSettings(data);
    return { ok: true };
  });
