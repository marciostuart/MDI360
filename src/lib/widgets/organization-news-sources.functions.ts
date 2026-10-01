import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isSafeNewsUrl } from "@/lib/widgets/data-sources";

const organizationNewsSourceSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2, "Informe o nome da fonte.").max(120),
  url: z
    .string()
    .trim()
    .url("Informe uma URL RSS válida.")
    .max(1000)
    .refine(isSafeNewsUrl, "Use uma fonte HTTPS pública e segura."),
  credit: z.string().trim().min(1, "Informe o crédito da fonte.").max(160),
  enabled: z.boolean().default(true),
  refreshMinutes: z.number().int().min(5).max(1440).default(30),
});

const saveSchema = z.object({
  sources: z.array(organizationNewsSourceSchema).max(30),
});

export type OrganizationNewsSource = {
  id: string;
  label: string;
  url: string;
  credit: string;
  enabled: boolean;
  refreshMinutes: number;
};

export async function readOrganizationNewsSources(
  organizationId: string,
): Promise<OrganizationNewsSource[]> {
  const { asc, eq } = await import("drizzle-orm");
  const { getDb, schema } = await import("@/lib/db/index.server");
  return getDb()
    .select({
      id: schema.organizationNewsSources.id,
      label: schema.organizationNewsSources.label,
      url: schema.organizationNewsSources.url,
      credit: schema.organizationNewsSources.credit,
      enabled: schema.organizationNewsSources.enabled,
      refreshMinutes: schema.organizationNewsSources.refreshMinutes,
    })
    .from(schema.organizationNewsSources)
    .where(eq(schema.organizationNewsSources.organizationId, organizationId))
    .orderBy(asc(schema.organizationNewsSources.createdAt));
}

export const fetchOrganizationNewsSources = createServerFn({ method: "GET" }).handler(async () => {
  const { requireRole } = await import("@/lib/auth/session.server");
  const user = await requireRole("owner", "admin");
  return readOrganizationNewsSources(user.organizationId);
});

export const saveOrganizationNewsSources = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireRole } = await import("@/lib/auth/session.server");
    const user = await requireRole("owner", "admin");
    const { and, eq, inArray } = await import("drizzle-orm");
    const { getDb, schema } = await import("@/lib/db/index.server");
    const db = getDb();
    const current = await readOrganizationNewsSources(user.organizationId);
    const currentIds = new Set(current.map((source) => source.id));
    const incomingIds = new Set<string>();

    for (const source of data.sources) {
      if (source.id) {
        if (!currentIds.has(source.id)) throw new Error("Fonte RSS inválida para esta empresa.");
        incomingIds.add(source.id);
      }
      if (!isSafeNewsUrl(source.url)) throw new Error("Uma fonte RSS não é segura.");
    }

    await db.transaction(async (tx) => {
      for (const source of data.sources) {
        if (source.id) {
          await tx
            .update(schema.organizationNewsSources)
            .set({
              label: source.label,
              url: source.url,
              credit: source.credit,
              enabled: source.enabled,
              refreshMinutes: source.refreshMinutes,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.organizationNewsSources.id, source.id),
                eq(schema.organizationNewsSources.organizationId, user.organizationId),
              ),
            );
        } else {
          await tx.insert(schema.organizationNewsSources).values({
            organizationId: user.organizationId,
            label: source.label,
            url: source.url,
            credit: source.credit,
            enabled: source.enabled,
            refreshMinutes: source.refreshMinutes,
          });
        }
      }

      const removed = current
        .map((source) => source.id)
        .filter((id) => !incomingIds.has(id));
      if (removed.length) {
        await tx
          .delete(schema.organizationNewsSources)
          .where(
            and(
              eq(schema.organizationNewsSources.organizationId, user.organizationId),
              inArray(schema.organizationNewsSources.id, removed),
            ),
          );
      }
    });

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);
    return readOrganizationNewsSources(user.organizationId);
  });

