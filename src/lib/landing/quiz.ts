import { z } from "zod";

export const ENDINGS = ["fim_a", "fim_b"] as const;
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
const optionSchema = z.object({
  id: identifier,
  label: z.string().trim().min(1).max(240),
  next: identifier,
  detail: z.boolean().default(false),
  detailLabel: z.string().max(160).default("Qual sistema você utiliza? (opcional)"),
});
const stepSchema = z.object({
  id: identifier,
  title: z.string().trim().min(1).max(300),
  field: identifier,
  type: z.enum(["choice", "text"]),
  next: identifier.default("fim_a"),
  options: z.array(optionSchema).max(16),
});
export const quizSchema = z
  .object({
    revision: z.string().uuid(),
    enabled: z.boolean(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(600),
    contactTitle: z.string().min(1).max(200),
    startLabel: z.string().min(1).max(80),
    consentText: z.string().min(1).max(500),
    start: identifier,
    steps: z.array(stepSchema).min(1).max(24),
    endings: z.object({ fim_a: z.string().min(1).max(1000), fim_b: z.string().min(1).max(1000) }),
    integrations: z.object({
      whatsappEnabled: z.boolean(),
      whatsappRecipient: z.string().max(20),
      webhookEnabled: z.boolean(),
      webhookUrl: z.string().max(2000),
    }),
  })
  .superRefine((quiz, ctx) => {
    const ids = new Set(quiz.steps.map((step) => step.id));
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (ids.size !== quiz.steps.length || ENDINGS.some((id) => ids.has(id)))
      fail("Os identificadores das perguntas devem ser únicos.");
    if (!ids.has(quiz.start)) fail("Escolha uma pergunta inicial válida.");
    for (const step of quiz.steps) {
      if (
        ["nome", "whatsapp", "email", "__proto__", "constructor", "prototype"].includes(step.field)
      )
        fail(`Campo reservado: ${step.field}.`);
      if (
        step.type === "choice" &&
        (!step.options.length ||
          new Set(step.options.map((option) => option.id)).size !== step.options.length)
      )
        fail(`Revise as opções de ${step.title}.`);
      for (const target of step.type === "text"
        ? [step.next]
        : step.options.map((option) => option.next)) {
        if (!ids.has(target) && !ENDINGS.includes(target as (typeof ENDINGS)[number]))
          fail(`Destino inexistente: ${target}.`);
      }
    }
    const visited = new Set<string>();
    // Limits keep validation cheap even for a malformed, highly branching graph.
    if (ids.size === quiz.steps.length) {
      const edges = new Map(
        quiz.steps.map((step) => [
          step.id,
          step.type === "text" ? [step.next] : step.options.map((option) => option.next),
        ]),
      );
      const done = new Set<string>();
      const visiting = new Set<string>();
      const cycle = (id: string): boolean => {
        if (visiting.has(id)) return true;
        if (done.has(id) || !edges.has(id)) return false;
        visiting.add(id);
        const result = edges.get(id)!.some(cycle);
        visiting.delete(id);
        done.add(id);
        return result;
      };
      if (quiz.steps.some((step) => cycle(step.id))) fail("O fluxo contém um ciclo.");
      else {
        // Reachability without exploring the same subtree repeatedly.
        const queue = [quiz.start];
        while (queue.length) {
          const id = queue.pop()!;
          if (visited.has(id)) continue;
          visited.add(id);
          queue.push(...(edges.get(id) ?? []));
        }
        if (quiz.steps.some((step) => !visited.has(step.id)))
          fail("Há perguntas desconectadas. Vincule-as a uma opção ou remova-as.");
      }
    }
    if (
      quiz.integrations.whatsappEnabled &&
      !/^\d{10,15}$/.test(quiz.integrations.whatsappRecipient)
    )
      fail("Informe o WhatsApp de destino com código do país e DDD, somente números.");
    if (quiz.integrations.webhookEnabled) {
      try {
        const url = new URL(quiz.integrations.webhookUrl);
        if (url.protocol !== "https:" || url.username || url.password || url.hash)
          throw new Error();
      } catch {
        fail("Informe um webhook HTTPS válido, sem usuário, senha ou fragmento.");
      }
    }
  });
export type QuizConfig = z.infer<typeof quizSchema>;
export type PublicQuiz = Omit<QuizConfig, "integrations">;
export type QuizAnswer = { stepId: string; optionId?: string; text?: string };
export type LeadPayload = Record<string, string>;
const option = (id: string, label: string, next: string, detail = false) => ({
  id,
  label,
  next,
  detail,
  detailLabel: "Qual sistema você utiliza? (opcional)",
});
const question = (
  id: string,
  title: string,
  field: string,
  options: ReturnType<typeof option>[],
) => ({ id, title, field, type: "choice" as const, next: "fim_a", options });
export const DEFAULT_QUIZ: QuizConfig = {
  revision: "00000000-0000-4000-8000-000000000001",
  enabled: true,
  title: "Um diagnóstico. Novas possibilidades para suas telas.",
  description:
    "Conte um pouco sobre sua operação e descubra a solução MDI 360 que faz sentido para você. Leva menos de 1 minuto.",
  contactTitle: "Antes de começar, como podemos falar com você?",
  startLabel: "Iniciar Diagnóstico",
  consentText:
    "Autorizo a MDI 360 a usar os dados deste diagnóstico para entrar em contato comigo por WhatsApp ou e-mail sobre a solução e sua proposta.",
  start: "objetivo",
  steps: [
    question("objetivo", "Qual é o seu principal objetivo com o MDI 360?", "tipo_perfil", [
      option("proprio", "Controlar as telas do meu próprio negócio (loja única ou redes)", "nicho"),
      option("revenda", "Revender o sistema para meus clientes (SaaS / White Label)", "atuacao"),
    ]),
    question(
      "nicho",
      "Qual é o segmento do seu negócio?",
      "nicho_ou_atuacao",
      [
        "Supermercado / Varejo Alimentar",
        "Academia",
        "Clínicas / Saúde",
        "Bares / Restaurantes",
        "Outro",
      ].map((label, i) => option(`n${i}`, label, "telas")),
    ),
    question(
      "telas",
      "Quantas telas você pretende gerenciar?",
      "quantidade_telas_meta",
      ["1 a 3 telas", "4 a 10 telas", "Mais de 10 telas"].map((label, i) =>
        option(`t${i}`, label, "crm"),
      ),
    ),
    question("crm", "Você já utiliza algum CRM ou Aplicativo de Fidelidade?", "crm_atual", [
      option("sim", "Sim", "fim_a", true),
      option("coletar", "Não (Mas quero coletar dados)", "fim_a"),
      option("nao", "Não utilizamos", "fim_a"),
    ]),
    question(
      "atuacao",
      "Qual é o foco da sua empresa hoje?",
      "nicho_ou_atuacao",
      [
        "Agência de Marketing / Comunicação Visual",
        "Empresa de TI / Infraestrutura",
        "Empreendedor Iniciante",
      ].map((label, i) => option(`a${i}`, label, "meta")),
    ),
    question(
      "meta",
      "Qual é a sua meta de telas ativas nos primeiros 3 meses?",
      "quantidade_telas_meta",
      ["Até 20 telas", "De 21 a 50 telas", "Mais de 50 telas"].map((label, i) =>
        option(`m${i}`, label, "fim_b"),
      ),
    ),
  ],
  endings: {
    fim_a:
      "Obrigado! Identificamos o melhor plano para o seu perfil. Nosso especialista vai te chamar no WhatsApp em instantes com sua proposta customizada.",
    fim_b:
      "Perfeito! Seu perfil foi qualificado como Parceiro SaaS. Nosso Diretor Comercial entrará em contato via WhatsApp para apresentar o modelo de parceria.",
  },
  integrations: {
    whatsappEnabled: false,
    whatsappRecipient: "5531920051113",
    webhookEnabled: false,
    webhookUrl: "",
  },
};
export const contactSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  whatsapp: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^(?:55)?[1-9]\d{9,10}$/.test(value), "WhatsApp inválido"),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  consent: z.literal(true),
});
export const submissionSchema = z.object({
  id: z.string().uuid(),
  revision: z.string().uuid(),
  contact: contactSchema,
  answers: z
    .array(
      z.object({
        stepId: identifier,
        optionId: identifier.optional(),
        text: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(24),
  website: z.string().max(200).default(""),
});

/** Rebuild the path server-side: no forged profiles, skipped questions or inactive-branch answers. */
export function consolidateQuiz(
  config: PublicQuiz,
  contact: z.infer<typeof contactSchema>,
  answers: QuizAnswer[],
) {
  let current = config.start;
  const payload: LeadPayload = {
    nome: contact.nome,
    whatsapp: contact.whatsapp,
    email: contact.email,
    tipo_perfil: "",
    nicho_ou_atuacao: "",
    quantidade_telas_meta: "",
    crm_atual: "Não informado",
  };
  const responses: { pergunta: string; resposta: string; campo: string }[] = [];
  for (const answer of answers) {
    const step = config.steps.find((entry) => entry.id === current);
    if (!step || step.id !== answer.stepId) throw new Error("Respostas fora do fluxo publicado.");
    const selected = step.options.find((entry) => entry.id === answer.optionId);
    if ((step.type === "choice" && !selected) || (step.type === "text" && !answer.text?.trim()))
      throw new Error("Preencha todas as perguntas.");
    if (answer.text && step.type === "choice" && !selected?.detail)
      throw new Error("Detalhe não permitido nesta opção.");
    const value =
      step.type === "text"
        ? answer.text!.trim()
        : `${selected!.label}${answer.text?.trim() ? ` — ${answer.text.trim()}` : ""}`;
    payload[step.field] = value;
    responses.push({ pergunta: step.title, resposta: value, campo: step.field });
    current = step.type === "text" ? step.next : selected!.next;
  }
  if (current !== "fim_a" && current !== "fim_b")
    throw new Error("Conclua o diagnóstico antes de enviar.");
  payload.tipo_perfil = current === "fim_a" ? "Cliente Final" : "Parceiro";
  return { payload, responses, ending: current as (typeof ENDINGS)[number] };
}

export function maskWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length <= 2
    ? digits
    : `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length > 10 ? 7 : 6)}${digits.length > 6 ? `-${digits.slice(digits.length > 10 ? 7 : 6)}` : ""}`;
}
export function remainingQuizSteps(config: PublicQuiz, id: string): number {
  const memo = new Map<string, number>();
  const count = (key: string): number => {
    if (memo.has(key)) return memo.get(key)!;
    const step = config.steps.find((entry) => entry.id === key);
    if (!step) return 0;
    const result =
      1 +
      Math.max(
        ...(step.type === "text" ? [step.next] : step.options.map((option) => option.next)).map(
          count,
        ),
      );
    memo.set(key, result);
    return result;
  };
  return count(id);
}
