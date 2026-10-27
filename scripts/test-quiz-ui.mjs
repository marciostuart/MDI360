// Run against a LOCAL server without DATABASE_URL. The capture endpoint is
// intercepted in Chromium; no real lead, WhatsApp message or webhook is sent.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.QUIZ_TEST_URL || "http://127.0.0.1:4176";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Only a local test server is allowed",
);
const profile = await mkdtemp(join(tmpdir(), "mdi-quiz-test-"));
const browser = spawn(
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-extensions",
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
      () => undefined,
    );
  }
  assert.ok(port, "Chromium did not start");
  const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
    response.json(),
  );
  ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const waiting = new Map();
  const captures = [];
  let failFirst = true;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const promise = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) promise?.reject(new Error(JSON.stringify(message.error)));
      else promise?.resolve(message.result);
    }
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      captures.push(JSON.parse(request.postData));
      void send("Fetch.fulfillRequest", {
        requestId,
        responseCode: failFirst ? 503 : 202,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
        body: Buffer.from(
          JSON.stringify(
            failFirst
              ? { error: "Falha de teste. Tente novamente." }
              : { ok: true, id: captures.at(-1).id },
          ),
        ).toString("base64"),
      });
      failFirst = false;
    }
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return;
      await delay(80);
    }
    throw new Error(
      `UI timeout: ${expression}; ${await evaluate("location.href + ': ' + document.body.innerText.slice(-800)")}`,
    );
  };
  const click = (text) =>
    evaluate(
      `(() => {const button=[...document.querySelectorAll('button')].find(node=>node.textContent.trim().endsWith(${JSON.stringify(text)})); if(!button)throw new Error('Button not found: '+${JSON.stringify(text)});button.click()})()`,
    );
  const fill = (selector, value) =>
    evaluate(
      `(() => {const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
  const heading = (text) =>
    wait(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(text)})`);
  const start = async () => {
    await send("Page.navigate", { url: `${base}/diagnostico` });
    await heading("diagnóstico");
    await delay(800);
    await fill('input[autocomplete="name"]', "Maria Teste");
    await fill('input[type="tel"]', "31999991234");
    await fill('input[type="email"]', "maria-teste@example.com");
    await evaluate("document.querySelector('input[type=checkbox]').click()");
    await click("Iniciar Diagnóstico");
    await heading("principal objetivo");
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/public/quiz", requestStage: "Request" }],
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await start();
  await click("Controlar as telas do meu próprio negócio (loja única ou redes)");
  await heading("segmento");
  await click("Clínicas / Saúde");
  await heading("Quantas telas");
  await click("4 a 10 telas");
  await heading("CRM");
  await click("Sim");
  await fill('input[maxlength="500"]', "CRM próprio");
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
    "Mobile horizontal overflow",
  );
  await delay(250);
  const screenshot = join(tmpdir(), "mdi-quiz-mobile.png");
  const image = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(screenshot, Buffer.from(image.data, "base64"));
  await click("Continuar");
  await wait("document.querySelector('[role=alert]')?.textContent.includes('Falha de teste')");
  await click("Tentar novamente");
  await heading("Obrigado!");
  assert.equal(captures.length, 2);
  assert.equal(captures[0].id, captures[1].id, "Retry must retain idempotency key");
  assert.equal(captures[1].answers.length, 4);
  assert.equal(captures[1].answers.at(-1).text, "CRM próprio");
  await start();
  await click("Controlar as telas do meu próprio negócio (loja única ou redes)");
  await heading("segmento");
  await click("Voltar");
  await heading("principal objetivo");
  await click("Revender o sistema para meus clientes (SaaS / White Label)");
  await heading("foco da sua empresa");
  await click("Agência de Marketing / Comunicação Visual");
  await heading("primeiros 3 meses");
  await click("Mais de 50 telas");
  await heading("Perfeito!");
  assert.equal(captures[2].answers.length, 3);
  assert.deepEqual(
    captures[2].answers.map((answer) => answer.stepId),
    ["objetivo", "atuacao", "meta"],
    "Back/branch change must discard inactive-path answers",
  );
  assert.equal(
    await evaluate("document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')"),
    "100",
  );
  assert.equal(await evaluate("document.querySelectorAll('h1').length"), 1);
  await send("Page.navigate", { url: `${base}/torre/site` });
  await wait(
    "[...document.querySelectorAll('[role=tab]')].some(node=>node.textContent==='Quiz e capturas')",
  );
  await delay(500);
  await evaluate(
    "[...document.querySelectorAll('[role=tab]')].find(node=>node.textContent==='Quiz e capturas').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))",
  );
  await wait(
    "document.querySelector('[role=alert]')?.textContent.includes('Verifique seu acesso')",
  );
  console.log(
    `PASS quiz UI: mobile A, CRM detail, retry/idempotency, back/branch B, completion/progress, admin access denied. Screenshot: ${screenshot}`,
  );
} finally {
  ws?.close();
  browser.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
