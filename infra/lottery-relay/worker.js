const CAIXA_ORIGIN = "https://servicebus2.caixa.gov.br";
const AGGREGATE_PATH = "/portaldeloterias/api/home/ultimos-resultados";
const GAME_PATHS = new Set([
  "megasena",
  "lotofacil",
  "quina",
  "lotomania",
  "timemania",
  "duplasena",
  "federal",
  "loteca",
  "diadesorte",
  "supersete",
  "maismilionaria",
]);
const MAX_RESPONSE_BYTES = 2_000_000;

function isAllowedPath(path) {
  if (path === AGGREGATE_PATH) return true;
  const match = path.match(/^\/portaldeloterias\/api\/([a-z]+)$/);
  return Boolean(match && GAME_PATHS.has(match[1]));
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    if (!env.RELAY_TOKEN || request.headers.get("authorization") !== `Bearer ${env.RELAY_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const path = new URL(request.url).searchParams.get("path") || "";
    if (!isAllowedPath(path)) return new Response("Path not allowed", { status: 400 });

    const cache = caches.default;
    const cacheKey = new Request(`https://mdi360-lottery-cache.invalid${path}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const upstream = await fetch(`${CAIXA_ORIGIN}${path}`, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        referer: "https://loterias.caixa.gov.br/",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      },
    });
    if (!upstream.ok) return new Response("Official source unavailable", { status: 502 });

    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_RESPONSE_BYTES) {
      return new Response("Official response too large", { status: 502 });
    }
    const response = new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=240",
        "x-lottery-source": CAIXA_ORIGIN,
      },
    });
    await cache.put(cacheKey, response.clone());
    return response;
  },
};
