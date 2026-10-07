import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeActivationBranding, type ActivationBrandStyle } from "@/lib/settings/activation-branding";

export type Branding = {
  organizationName: string;
  splashText: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  hasLogo: boolean;
  activationStyle: ActivationBrandStyle;
};

/** Branding of the caller's own organization. Never crosses tenants. */
export const getBranding = createServerFn({ method: "GET" }).handler(
  async (): Promise<Branding | null> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;

    const { requireUser } = await import("@/lib/auth/session.server");
    const { eq } = await import("drizzle-orm");
    const user = await requireUser();

    const rows = await getDb()
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    const org = rows[0];
    if (!org) return null;

    let logoUrl: string | null = null;
    if (org.brandLogoKey) {
      try {
        const { createDownloadUrl } = await import("@/lib/storage.server");
        logoUrl = await createDownloadUrl(org.brandLogoKey, 3600);
      } catch {
        logoUrl = null;
      }
    }

    return {
      organizationName: org.name,
      splashText: org.brandSplashText,
      brandColor: org.brandColor,
      logoUrl,
      hasLogo: Boolean(org.brandLogoKey),
      activationStyle: normalizeActivationBranding(org.brandActivationStyle),
    };
  },
);

export const updateBranding = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        splashText: z.string().trim().max(80).nullable(),
        brandColor: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB")
          .nullable(),
        activationStyle: z.unknown().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .update(schema.organizations)
      .set({
        brandSplashText: data.splashText && data.splashText.length > 0 ? data.splashText : null,
        brandColor: data.brandColor,
        brandActivationStyle: normalizeActivationBranding(data.activationStyle),
      })
      .where(eq(schema.organizations.id, user.organizationId));

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { ok: true };
  });

export const removeBrandLogo = createServerFn({ method: "POST" }).handler(async () => {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { requireUser } = await import("@/lib/auth/session.server");
  const { eq } = await import("drizzle-orm");
  const user = await requireUser();

  await getDb()
    .update(schema.organizations)
    .set({ brandLogoKey: null })
    .where(eq(schema.organizations.id, user.organizationId));

  const { notifyOrganization } = await import("@/lib/player/realtime.server");
  notifyOrganization(user.organizationId);

  return { ok: true };
});
