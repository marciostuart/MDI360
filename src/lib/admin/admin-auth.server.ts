export async function requirePlatformAdmin() {
  const { getSessionUser } = await import("@/lib/auth/session.server");
  const user = await getSessionUser();
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!user || !allowed.includes(user.email.toLowerCase())) throw new Error("FORBIDDEN");
  return user;
}
