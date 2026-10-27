import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import type { LeadPayload, QuizConfig } from "./quiz.ts";

const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(ip, prefix, "ipv4");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
export async function webhookDestination(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw new Error("Webhook deve usar HTTPS na porta 443.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await Promise.race([
        lookup(host, { all: true }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Tempo limite do DNS do webhook.")), 10_000);
          timeout.unref();
        }),
      ]).finally(() => clearTimeout(timeout));
  if (
    !addresses.length ||
    addresses.some(
      (entry) =>
        (entry.family === 6 && !globalIpv6.check(entry.address, "ipv6")) ||
        blocked.check(entry.address, entry.family === 6 ? "ipv6" : "ipv4"),
    )
  )
    throw new Error("Webhook deve apontar para um servidor público.");
  return { url, address: addresses[0] };
}

export async function dispararWebhook(
  dados: LeadPayload,
  integrations: QuizConfig["integrations"],
  id: string,
) {
  const { url, address } = await webhookDestination(integrations.webhookUrl);
  // Pinned DNS + no redirects. The URL and any query secret stay server-side.
  await new Promise<void>((resolve, reject) => {
    const body = JSON.stringify(dados);
    const req = httpsRequest(
      url,
      {
        method: "POST",
        family: address.family,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "idempotency-key": id,
        },
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      },
      (response) => {
        response.destroy();
        if ((response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300) resolve();
        else reject(new Error(`Webhook respondeu HTTP ${response.statusCode ?? 0}.`));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("Tempo limite do webhook.")), 10_000);
    timer.unref();
    req.once("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(body);
  });
}
