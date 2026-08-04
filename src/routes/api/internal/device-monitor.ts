import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/device-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.DEVICE_MONITOR_TOKEN;
        const received =
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          request.headers.get("x-monitor-token");
        if (!expected) return new Response("Monitor não configurado", { status: 503 });
        if (!received || received.length !== expected.length || !crypto.subtle)
          return new Response("Não autorizado", { status: 401 });
        const encoder = new TextEncoder();
        const [a, b] = await Promise.all([
          crypto.subtle.digest("SHA-256", encoder.encode(received)),
          crypto.subtle.digest("SHA-256", encoder.encode(expected)),
        ]);
        const aa = new Uint8Array(a);
        const bb = new Uint8Array(b);
        let mismatch = aa.length ^ bb.length;
        for (let i = 0; i < Math.min(aa.length, bb.length); i += 1) mismatch |= aa[i]! ^ bb[i]!;
        if (mismatch !== 0) return new Response("Não autorizado", { status: 401 });
        const { monitorDeviceNotifications } =
          await import("@/lib/notifications/device-monitor.server");
        return Response.json(await monitorDeviceNotifications(), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
