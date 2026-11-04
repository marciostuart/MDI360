import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { canAccessTowerPath, isTowerPath } from "./lib/admin/tower-path";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Gate every Tower document request before SSR renders any administrative UI.
// Server functions retain their own authorization checks independently.
const towerBoundary = createMiddleware().server(async ({ request, next }) => {
  const path = new URL(request.url).pathname;
  if (!isTowerPath(path)) return next();

  const allowed = await canAccessTowerPath(path, async () => {
    const { requirePlatformAdmin } = await import("./lib/admin/admin-auth.server");
    return requirePlatformAdmin();
  });
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    Vary: "Cookie",
  };
  if (!allowed) return new Response("Not Found", { status: 404, headers });

  const { setResponseHeader } = await import("@tanstack/react-start/server");
  for (const [name, value] of Object.entries(headers)) setResponseHeader(name, value);
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, towerBoundary, csrfMiddleware],
}));
