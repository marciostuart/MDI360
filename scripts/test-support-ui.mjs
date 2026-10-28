// Local-only UI fixtures. All support RPCs are intercepted; no real data is changed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const base = process.env.SUPPORT_TEST_URL ?? "http://127.0.0.1:4186";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const asset = (await readdir(".output/public/assets")).find((name) => /^dados-.*\.js$/.test(name));
const bundle = await readFile(join(".output/public/assets", asset), "utf8");
const ids = [
  ...bundle.matchAll(/method:`(?:GET|POST)`\}\)\.handler\(\w+\(`([a-f0-9]{64})`\)\)/g),
].map((match) => match[1]);
assert.equal(ids.length, 7);
const org = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000002";
const profile = await mkdtemp(join(tmpdir(), "mdi-support-ui-"));
const chrome = spawn(
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--disable-extensions",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await delay(100);
    port = await readFile(join(profile, "DevToolsActivePort"), "utf8").then(
      (text) => Number(text.split("\n")[0]),
      () => null,
    );
  }
  assert.ok(port);
  const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let seq = 0;
  const pending = new Map(),
    mutations = [];
  const rpcUrls = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(String(event.data));
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p?.reject(m.error);
      else p?.resolve(m.result);
    }
    if (m.method === "Fetch.requestPaused") {
      const { requestId, request } = m.params;
      const index = ids.findIndex((id) => request.url.includes(id));
      if (index < 0) {
        void send("Fetch.continueRequest", { requestId });
        return;
      }
      rpcUrls.set(index, request.url);
      const payload = decodeURIComponent(request.url) + (request.postData ?? "");
      let result = { ok: true };
      if (request.method === "POST") mutations.push(request.postData);
      if (index === 0) result = [{ id: org, name: "Empresa de teste" }];
      if (index === 1) {
        const resource = payload.includes("queue_operators")
          ? "operators"
          : payload.includes("users")
            ? "users"
            : "queues";
        const record =
          resource === "users"
            ? {
                id,
                name: "Usuário de teste",
                email: "teste@example.com",
                is_active: true,
                roles: ["owner"],
              }
            : resource === "operators"
              ? {
                  id,
                  name: "Operador de teste",
                  username: "teste",
                  desk_label: "Guichê 1",
                  is_enabled: true,
                }
              : { id, name: "Fila preservada", username: "reservado", is_enabled: true };
        result = {
          total: 1,
          items: [
            {
              record,
              organization_name: "Empresa de teste",
              organization_id: org,
              linked_terminals: resource === "queues" ? 0 : null,
            },
          ],
        };
      }
      if (index === 4)
        result = {
          cursor: null,
          items: [
            {
              organizationId: org,
              key: `org/${org}/old.webp`,
              size: 500,
              modifiedAt: "2026-10-20T00:00:00Z",
              referenced: false,
              mature: true,
            },
            {
              organizationId: org,
              key: `org/${org}/live.webp`,
              size: 600,
              modifiedAt: "2026-10-20T00:00:00Z",
              referenced: true,
              mature: true,
            },
          ],
        };
      void send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
        body: Buffer.from(JSON.stringify({ result, context: {} })).toString("base64"),
      });
    }
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(`Boolean(document.body) && Boolean(${expression})`)) return;
      await delay(80);
    }
    throw new Error(
      `Timeout: ${expression}; ${await evaluate("document.body?.innerText.slice(-1200)")}`,
    );
  };
  const click = (text) =>
    evaluate(
      `Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`,
    );
  const fill = (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  const choose = (label, value) =>
    evaluate(
      `(()=>{const e=document.querySelector('select[aria-label="'+${JSON.stringify(label)}+'"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${base}/torre/dados` });
  await wait("document.body.innerText.includes('Fila preservada')");
  assert.ok(await evaluate("document.body.innerText.includes('0 terminal(is)')"));
  await click("Excluir");
  assert.ok(await evaluate("document.querySelector('button[type=submit]').disabled"));
  await fill("#support-reason", "Teste de exclusão com confirmação");
  await fill("#support-confirm", id);
  await wait("!document.querySelector('button[type=submit]').disabled");
  await click("Excluir definitivamente");
  await wait("!document.querySelector('[role=dialog]')");
  assert.equal(mutations.length, 1);
  await choose("Tipo de cadastro", "users");
  await wait("document.body.innerText.includes('Usuário de teste')");
  await click("Editar");
  await wait("document.querySelector('#support-roles')");
  assert.equal(await evaluate("document.querySelectorAll('input[type=password]').length"), 1);
  await evaluate(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
  );
  await wait("!document.querySelector('[role=dialog]')");
  await choose("Estabelecimento", org);
  await click("Arquivos / possíveis órfãos");
  await wait("document.body.innerText.includes('old.webp')");
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('button')).filter(e=>e.textContent.trim()==='Excluir órfão' && !e.disabled).length",
    ),
    1,
  );
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  const output = join(tmpdir(), "mdi-support-ui.png");
  await writeFile(output, Buffer.from(screenshot.data, "base64"));
  console.log(
    `PASS: detached queue, exact-ID confirmation, one password field, role editor, protected referenced files. Screenshot: ${output}`,
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(300);
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= 390"),
    "Support page must fit mobile viewport",
  );
  // Node fetch is outside the browser interceptor: exercise the real guard.
  const denied = await fetch(rpcUrls.get(0), { headers: { "x-tsr-serverFn": "true" } });
  assert.match(
    await denied.text(),
    /forbidden/i,
    "Unauthenticated RPC must be rejected before any DB read",
  );
} finally {
  ws?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
