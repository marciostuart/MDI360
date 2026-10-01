import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A real Chromium paint with a fake native bridge, without a live server/token.
// This verifies templates/transparent overlays, not Android hardware decoders.
const run = promisify(execFile);
const browser = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const directory = resolve("dist/native-player");
const html = await readFile(join(directory, "index.html"), "utf8");
const news = Array.from({ length: 6 }, (_, i) => ({ title: `Manchete teste ${i + 1}`, summary: "Resumo local", image: null, publishedAt: null }));
const cases = [
  { name: "clock", config: { type: "clock", timezone: "UTC", showSeconds: true, showDate: true }, payload: null, texts: ["12:34:56"] },
  { name: "weather", config: { type: "weather", cityId: "belo-horizonte" }, payload: { city: "Belo Horizonte", credit: "Fonte teste", current: { temperature: 27, humidity: 58, code: 0 }, daily: [] }, texts: ["Belo Horizonte", "27"] },
  { name: "currency", config: { type: "currency", pairs: ["USD-BRL"] }, payload: { credit: "Fonte teste", quotes: [{ code: "USD", name: "Dólar", value: 5.12, changePct: 1 }] }, texts: ["Dólar", "5,12"] },
  { name: "lottery", config: { type: "lottery", gameIds: ["megasena"], rotateSeconds: 10 }, payload: { credit: "Loterias CAIXA", results: [{ gameId: "megasena", gameName: "Mega-Sena", contestNumber: 3000, drawDate: "01/10/2026", numbers: ["01", "12", "23", "34", "45", "56"], secondDraw: [], clovers: [], federalPrizes: [], matches: [], accumulated: false, nextEstimate: 1000000, nextDate: null, prizes: [] }] }, texts: ["Mega-Sena", "3000", "23", "56"] },
  { name: "news", config: { type: "news", feedId: "teste", headlines: 2, oneAtATime: false, rotateSeconds: 7, showSummary: true, summaryMaxChars: 240, showImage: true }, payload: { source: "Fonte teste", credit: "Teste", items: news }, texts: ["Manchete teste 3", "Manchete teste 4"] },
  { name: "video", kind: "video", texts: [] },
];
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/__native-ui/" || url.pathname === "/__native-ui/index.html") {
      const fixture = cases.find((item) => item.name === url.searchParams.get("case"));
      if (!fixture) { response.writeHead(404).end(); return; }
      const bridge = `<script>
        const fixture = ${JSON.stringify(fixture)};
        let fetches = 0;
        window.fetch = () => { fetches++; return Promise.reject(new Error('No widget HTTP permitted')); };
        window.addEventListener('error', (e) => document.documentElement.dataset.error = e.message);
        const frame = (id) => ({ playbackId: id, item: { kind: fixture.kind || 'widget', name: fixture.name, widgetConfig: fixture.config, widgetData: fixture.payload } });
        window.MDI360Native = {
          localFrame: () => JSON.stringify(frame('first')),
          clockNow: () => Date.parse('2026-10-01T12:34:56Z'),
          setCallAudio: () => {},
          visualReady: () => { document.documentElement.dataset.ready = 'yes'; },
          rendererReady: () => {
            window.__mdi360LocalFrame(frame('first'));
            if (fixture.name === 'news') setTimeout(() => {
              document.documentElement.dataset.firstBatch = String(document.body.innerText.includes('Manchete teste 1') && document.body.innerText.includes('Manchete teste 2'));
              window.__mdi360LocalFrame(frame('second'));
            }, 1000);
            setTimeout(() => {
              document.documentElement.dataset.fetches = String(fetches);
              document.documentElement.dataset.transparent = String(getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)');
              document.documentElement.dataset.webVideos = String(document.querySelectorAll('video').length);
              document.documentElement.dataset.done = 'yes';
            }, 2500);
          }
        };
      </script>`;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(html.replace("<head>", "<head>" + bridge));
      return;
    }
    if (!url.pathname.startsWith("/__native-ui/assets/") || url.pathname.includes("..")) { response.writeHead(404).end(); return; }
    const file = join(directory, "assets", url.pathname.split("/").pop());
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "text/css");
    response.end(await readFile(file));
  } catch { response.writeHead(500).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
try {
  for (const fixture of cases) {
    const profile = await mkdtemp(join(tmpdir(), "mdi-renderer-test-"));
    try {
      const { stdout } = await run(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", "--disable-component-update", "--disable-extensions", `--user-data-dir=${profile}`, "--virtual-time-budget=5000", "--dump-dom", `http://127.0.0.1:${port}/__native-ui/?case=${fixture.name}`], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      assert.match(stdout, /data-done="yes"/, `${fixture.name}: renderer did not complete`);
      assert.doesNotMatch(stdout, /data-error=/, `${fixture.name}: runtime error`);
      assert.match(stdout, /data-fetches="0"/, `${fixture.name}: unexpected widget HTTP`);
      assert.match(stdout, /data-transparent="true"/, `${fixture.name}: covers native video surface`);
      assert.match(stdout, /data-ready="yes"/, `${fixture.name}: missing visual readiness`);
      for (const text of fixture.texts) assert.ok(stdout.includes(text), `${fixture.name}: missing ${text}`);
      if (fixture.name === "news") assert.match(stdout, /data-first-batch="true"/, "News must advance 1/2 to 3/4 across playlist passes");
      if (fixture.name === "video") assert.match(stdout, /data-web-videos="0"/, "Web layer cannot create a second decoder for local video");
      process.stdout.write(`PASS local renderer: ${fixture.name}\n`);
    } finally { await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  }
} finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
