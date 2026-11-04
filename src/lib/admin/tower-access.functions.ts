import { createServerFn } from "@tanstack/react-start";

/** Client navigation must revalidate the server-side platform session. */
export const canOpenTower = createServerFn({ method: "GET" }).handler(async () => {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store, max-age=0");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  setResponseHeader("Vary", "Cookie");
  try {
    const { requirePlatformAdmin } = await import("@/lib/admin/admin-auth.server");
    await requirePlatformAdmin();
    return true;
  } catch {
    return false;
  }
});
