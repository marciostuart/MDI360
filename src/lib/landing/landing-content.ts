export type LandingItem = { title: string; description: string };
export type LandingFaq = { question: string; answer: string };

export type LandingContent = {
  eyebrow: string;
  headline: string;
  highlightedHeadline: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  heroImageUrl: string;
  platformImageUrl: string;
  queueImageUrl: string;
  whatsappUrl: string;
  proofLine: string;
  stats: LandingItem[];
  audiences: LandingItem[];
  features: LandingItem[];
  resellerTitle: string;
  resellerDescription: string;
  faqs: LandingFaq[];
  finalTitle: string;
  finalDescription: string;
};

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  eyebrow: "Sinalização digital + atendimento inteligente",
  headline: "Toda tela pode vender.",
  highlightedHeadline: "Todo atendimento pode fluir.",
  heroDescription:
    "Centralize conteúdos, telas, filas e resultados em uma plataforma feita para operar no mundo real — do primeiro display ao projeto de uma rede inteira.",
  primaryCta: "Começar agora",
  secondaryCta: "Ver a plataforma",
  heroImageUrl: "",
  platformImageUrl: "",
  queueImageUrl: "",
  whatsappUrl: "https://wa.me/5531920051113",
  proofLine: "Android · Roku · Windows · Linux · Navegador",
  stats: [
    { title: "1 painel", description: "para telas, conteúdos, filas e relatórios" },
    { title: "24/7", description: "monitoramento da operação em tempo real" },
    { title: "Multiempresa", description: "estrutura pronta para parceiros e revendas" },
  ],
  audiences: [
    {
      title: "Varejo e serviços",
      description: "Campanhas, ofertas, cardápios e comunicação que mudam no tempo certo.",
    },
    {
      title: "Clínicas e atendimento",
      description: "Emissão e chamada de senhas integradas à comunicação da recepção.",
    },
    {
      title: "Empresas e instituições",
      description: "Informação interna, indicadores, avisos e conteúdo em múltiplas unidades.",
    },
    {
      title: "Integradores e revendas",
      description: "Gerencie clientes, planos e operações a partir de uma única torre de controle.",
    },
  ],
  features: [
    {
      title: "Playlists que pensam no tempo",
      description: "Agendamentos, sublistas e programação por tela sem reconstruir campanhas.",
    },
    {
      title: "Conteúdo vivo",
      description:
        "Imagens, vídeos, páginas, relógio, clima, notícias e widgets em composições flexíveis.",
    },
    {
      title: "Senhas sem improviso",
      description:
        "Totem, impressão térmica, painel de chamada, setores, prioridades e operadores.",
    },
    {
      title: "Operação sob controle",
      description:
        "Status online, captura de tela, comandos remotos e alertas por WhatsApp no horário de funcionamento.",
    },
    {
      title: "Prova de exibição",
      description: "Relatórios mostram o que foi reproduzido, em qual tela e em que momento.",
    },
    {
      title: "Sua marca na frente",
      description: "Identidade visual por cliente e experiência consistente em telas e terminais.",
    },
  ],
  resellerTitle: "Sua operação cresce. A plataforma cresce junto.",
  resellerDescription:
    "A Torre de Controle reúne clientes, limites, planos e infraestrutura. Você vende a solução com sua estratégia comercial enquanto o MDI 360 organiza a operação.",
  faqs: [
    {
      question: "Preciso comprar equipamentos específicos?",
      answer:
        "Não. O MDI 360 trabalha com Android, Roku, navegadores e terminais Windows ou Linux, permitindo aproveitar diferentes cenários de hardware.",
    },
    {
      question: "Consigo controlar várias unidades?",
      answer:
        "Sim. Cada tela pode ter sua própria programação, configurações e monitoramento dentro da mesma conta.",
    },
    {
      question: "O sistema de senhas é separado?",
      answer:
        "Ele é integrado: emissão, impressão, chamada e comunicação visual podem fazer parte da mesma experiência.",
    },
    {
      question: "Posso revender a plataforma?",
      answer:
        "Sim. A estrutura multiempresa e a Torre de Controle foram pensadas também para integradores e parceiros comerciais.",
    },
  ],
  finalTitle: "Sua próxima tela já pode fazer mais.",
  finalDescription: "Crie sua conta ou converse com a 360BH para desenhar uma operação sob medida.",
};

export function normalizeLandingContent(value: unknown): LandingContent {
  if (!value || typeof value !== "object") return DEFAULT_LANDING_CONTENT;
  return { ...DEFAULT_LANDING_CONTENT, ...(value as Partial<LandingContent>) };
}
