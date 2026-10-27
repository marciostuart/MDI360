import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUIZ,
  consolidateQuiz,
  contactSchema,
  maskWhatsapp,
  quizSchema,
  remainingQuizSteps,
  submissionSchema,
} from "../src/lib/landing/quiz.ts";
import { webhookDestination } from "../src/lib/landing/quiz-webhook.server.ts";

const contact = contactSchema.parse({
  nome: "Maria Silva",
  whatsapp: "(31) 99999-1234",
  email: "MARIA@example.com",
  consent: true,
});
const a = [
  { stepId: "objetivo", optionId: "proprio" },
  { stepId: "nicho", optionId: "n2" },
  { stepId: "telas", optionId: "t1" },
  { stepId: "crm", optionId: "sim", text: "CRM próprio" },
];
const b = [
  { stepId: "objetivo", optionId: "revenda" },
  { stepId: "atuacao", optionId: "a0" },
  { stepId: "meta", optionId: "m2" },
];
test("quiz padrão é um grafo publicável e os percursos têm a extensão esperada", () => {
  assert.equal(quizSchema.safeParse(DEFAULT_QUIZ).success, true);
  assert.equal(remainingQuizSteps(DEFAULT_QUIZ, "objetivo"), 4);
  assert.equal(remainingQuizSteps(DEFAULT_QUIZ, "atuacao"), 2);
});
test("cliente final consolida dados limpos e detalhe opcional", () => {
  const result = consolidateQuiz(DEFAULT_QUIZ, contact, a);
  assert.equal(result.ending, "fim_a");
  assert.equal(result.payload.tipo_perfil, "Cliente Final");
  assert.equal(result.payload.nicho_ou_atuacao, "Clínicas / Saúde");
  assert.equal(result.payload.quantidade_telas_meta, "4 a 10 telas");
  assert.equal(result.payload.crm_atual, "Sim — CRM próprio");
  assert.equal(result.payload.email, "maria@example.com");
  assert.equal(result.payload.whatsapp, "31999991234");
  assert.equal(result.responses.length, 4);
});
test("parceiro não herda CRM ou respostas do caminho cliente", () => {
  const result = consolidateQuiz(DEFAULT_QUIZ, contact, b);
  assert.equal(result.ending, "fim_b");
  assert.equal(result.payload.tipo_perfil, "Parceiro");
  assert.equal(result.payload.quantidade_telas_meta, "Mais de 50 telas");
  assert.equal(result.payload.crm_atual, "Não informado");
  assert.equal(result.responses.length, 3);
});
test("detalhe do CRM é realmente opcional", () => {
  assert.equal(
    consolidateQuiz(
      DEFAULT_QUIZ,
      contact,
      a.map((answer) => ({ ...answer, text: undefined })),
    ).payload.crm_atual,
    "Sim",
  );
});
test("não aceita pular perguntas, forjar opções, misturar fluxos nem acrescentar após encerramento", () => {
  for (const answers of [
    a.slice(0, 3),
    [a[0], a[2], a[3]],
    [b[0], a[1], a[2], a[3]],
    [...b, a[3]],
    [{ stepId: "objetivo", optionId: "forjado" }],
  ])
    assert.throws(() => consolidateQuiz(DEFAULT_QUIZ, contact, answers));
});
test("opção sem campo adicional não recebe texto arbitrário", () => {
  assert.throws(() =>
    consolidateQuiz(
      DEFAULT_QUIZ,
      contact,
      b.map((answer, index) => ({ ...answer, ...(index === 2 ? { text: "Injetado" } : {}) })),
    ),
  );
});
test("editor rejeita ciclos, destinos ausentes, IDs duplicados e campos reservados", () => {
  for (const change of [
    (q: typeof DEFAULT_QUIZ) => {
      q.steps[0].options[0].next = "objetivo";
    },
    (q: typeof DEFAULT_QUIZ) => {
      q.steps[0].options[0].next = "inexistente";
    },
    (q: typeof DEFAULT_QUIZ) => {
      q.steps[1].id = q.steps[0].id;
    },
    (q: typeof DEFAULT_QUIZ) => {
      q.steps[0].field = "nome";
    },
  ]) {
    const config = structuredClone(DEFAULT_QUIZ);
    change(config);
    assert.equal(quizSchema.safeParse(config).success, false);
  }
});
test("editor rejeita integração habilitada sem destino válido", () => {
  const config = structuredClone(DEFAULT_QUIZ);
  config.integrations.webhookEnabled = true;
  config.integrations.webhookUrl = "http://localhost/webhook";
  assert.equal(quizSchema.safeParse(config).success, false);
  config.integrations.webhookEnabled = false;
  config.integrations.whatsappEnabled = true;
  config.integrations.whatsappRecipient = "123";
  assert.equal(quizSchema.safeParse(config).success, false);
});
test("captura exige autorização explícita, e-mail, telefone e UUID de idempotência", () => {
  assert.equal(contactSchema.safeParse({ ...contact, consent: false }).success, false);
  assert.equal(contactSchema.safeParse({ ...contact, email: "inválido" }).success, false);
  assert.equal(contactSchema.safeParse({ ...contact, whatsapp: "1234" }).success, false);
  assert.equal(
    submissionSchema.safeParse({
      id: "não-uuid",
      revision: DEFAULT_QUIZ.revision,
      contact,
      answers: b,
    }).success,
    false,
  );
  assert.equal(maskWhatsapp("31999991234"), "(31) 99999-1234");
});
test("webhook bloqueia rede privada, metadados, IPv6 local/mapeado, portas e credenciais", async () => {
  for (const url of [
    "https://127.0.0.1/hook",
    "https://10.0.0.1/hook",
    "https://169.254.169.254/hook",
    "https://192.168.3.1/hook",
    "https://[::1]/hook",
    "https://[::ffff:127.0.0.1]/hook",
    "https://[fc00::1]/hook",
    "https://[2002:7f00:1::]/hook",
    "http://8.8.8.8/hook",
    "https://8.8.8.8:8443/hook",
    "https://user:secret@8.8.8.8/hook",
  ])
    await assert.rejects(() => webhookDestination(url));
  assert.equal((await webhookDestination("https://8.8.8.8/hook")).address.address, "8.8.8.8");
});
