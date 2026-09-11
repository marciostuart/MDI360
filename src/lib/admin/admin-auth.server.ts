export async function requirePlatformAdmin() {
  const { getSessionUser, getImpersonatorUser } = await import("@/lib/auth/session.server");
  const current = await getSessionUser();
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const user =
    current && allowed.includes(current.email.toLowerCase())
      ? current
      : await getImpersonatorUser();
  if (!user || !allowed.includes(user.email.toLowerCase())) throw new Error("FORBIDDEN");
  return user;
}
