const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[a-zA-Z0-9_./-]+$/;
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Never touch other buckets, unknown roots or paths outside a tenant namespace. */
export function orphanOrganizationId(key: string, area: "org" | "branding") {
  const parts = key.split("/");
  if (parts[0] !== area || !UUID.test(parts[1] ?? "") || parts.length < 3 || !SAFE_KEY.test(key))
    return null;
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts[1]!;
}

export function isMatureOrphanDate(value: string | Date | null, now = Date.now()) {
  if (!value) return false;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) && time <= now - ORPHAN_MIN_AGE_MS;
}

export function isOwnedTemporaryDirectory(name: string) {
  return /^mdi360-(?:video|image)-[A-Za-z0-9]{6}$/.test(name);
}
