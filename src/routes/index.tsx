import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Brain,
  CalendarClock,
  Check,
  Eye,
  Images,
  ListVideo,
  MonitorPlay,
  Palette,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MDI 360 — Plataforma de mídia digital indoor para a sua marca" },
      {
        name: "description",
        content:
          "Crie sua conta, conecte suas TVs e controle playlists, horários e campanhas de qualquer lugar. Você paga apenas por tela ativa, com a sua marca no painel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:title",
        content: "MDI 360 — Plataforma de mídia digital indoor para a sua marca",
      },
      {
        property: "og:description",
        content:
          "Gerencie suas telas em um painel com a sua identidade visual. Cobrança simples: por tela ativa, por mês.",
      },
    ],
  }),
  component: LandingPage,
});

const PAIN_POINTS = [
  {
    icon: Brain,
    title: "Sobrecarga sensorial",
    body: "O cérebro apaga o que é monótono. Se a sua marca não se move na tela, ela é ignorada em segundos.",
  },
  {
    icon: Eye,
    title: "A ansiedade da espera",
    body: "Na fila, na recepção, na clínica: o olhar procura ativamente uma tela para aliviar o tédio.",
  },
  {
    icon: Sparkles,
    title: "Efeito da mera exposição",
    body: "Confiança nasce da repetição. Quem aparece todos os dias no campo visual vira a primeira escolha.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Crie sua conta",
    body: "Cadastro em menos de um minuto. Sua empresa entra isolada, com seus próprios usuários e permissões.",
  },
  {
    step: "2",
    title: "Conecte suas TVs",
    body: "Instale o app no aparelho Android, digite o código de pareamento que aparece na tela e pronto.",
  },
  {
    step: "3",
    title: "Publique e agende",
    body: "Monte playlists, defina horários e a tela atualiza sozinha, em tempo real, sem ninguém no local.",
  },
];

const FEATURES = [
  {
    icon: Tv,
    title: "Telas sob controle",
    body: "Veja quem está online, o que está tocando agora e envie comandos remotos a qualquer momento.",
  },
  {
    icon: Images,
    title: "Biblioteca de conteúdos",
    body: "Imagens, vídeos e páginas web organizados em um só lugar, entregues às telas por links seguros.",
  },
  {
    icon: ListVideo,
    title: "Playlists flexíveis",
    body: "Sequência, duração por item e publicação em várias telas de uma só vez.",
  },
  {
    icon: CalendarClock,
    title: "Agenda por horário",
    body: "Menu no almoço, promoção à noite. Cada janela de horário toca a playlist certa.",
  },
  {
    icon: Radio,
    title: "Tempo real de verdade",
    body: "Publicou? A tela troca na hora. Sem reiniciar nada, sem depender de alguém na loja.",
  },
  {
    icon: Users,
    title: "Equipe com papéis",
    body: "Dono, administrador e operador. Cada pessoa vê e faz apenas o que precisa.",
  },
];

const WHITE_LABEL = [
  "Seu logo no painel e na tela de login",
  "Cores da sua marca aplicadas à interface",
  "Nome da sua operação em vez do nosso",
  "Telas de espera e loops com sua identidade",
];

const PLANS = [
  {
    name: "Essencial",
    price: "R$ 97",
    unit: "por tela ativa / mês",
    highlight: false,
    items: [
      "Telas ilimitadas (você paga o que ativar)",
      "Playlists e agendamentos",
      "Player Android incluso",
      "Monitoramento em tempo real",
    ],
  },
  {
    name: "Marca própria",
    price: "R$ 147",
    unit: "por tela ativa / mês",
    highlight: true,
    items: [
      "Tudo do Essencial",
      "Painel com seu logo e suas cores",
      "Usuários e papéis para a sua equipe",
      "Suporte prioritário no WhatsApp",
    ],
  },
  {
    name: "Rede",
    price: "Sob consulta",
    unit: "a partir de 30 telas",
    highlight: false,
    items: [
      "Preço por volume de telas",
      "Múltiplas unidades e locais",
      "Relatórios de exibição",
      "Onboarding acompanhado",
    ],
  },
];

const FAQ = [
  {
    q: "O que conta como tela ativa?",
    a: "Somente os aparelhos pareados e exibindo conteúdo. Telas pausadas ou removidas não entram na fatura do mês.",
  },
  {
    q: "Preciso comprar equipamento novo?",
    a: "Não. Qualquer TV com um aparelho Android (TV Box ou Smart TV compatível) roda o nosso player.",
  },
  {
    q: "Consigo colocar a minha marca no sistema?",
    a: "Sim. No plano Marca própria o painel usa o seu logo e as suas cores, para o seu cliente final ver apenas você.",
  },
  {
    q: "E se a internet cair na loja?",
    a: "O player mantém o conteúdo em cache e continua exibindo. Ao reconectar, ele sincroniza automaticamente.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MonitorPlay className="size-5" />
            </span>
            <span className="font-display text-lg font-semibold">MDI 360</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#como-funciona" className="hover:text-foreground">
              Como funciona
            </a>
            <a href="#recursos" className="hover:text-foreground">
              Recursos
            </a>
            <a href="#marca" className="hover:text-foreground">
              Sua marca
            </a>
            <a href="#planos" className="hover:text-foreground">
              Planos
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/entrar">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/entrar">Criar conta</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="console-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 lg:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-signal-online" />
            O poder da neurociência nas vendas
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
            Sua marca gravada no subconsciente do cliente, todos os dias.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            O cérebro é programado para focar em luz e movimento. O MDI 360 é a plataforma que
            transforma qualquer TV em mídia digital indoor — você cria sua conta, conecta as telas e
            controla tudo do celular ou do computador.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/entrar">Criar minha conta grátis</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#planos">Ver preço por tela</a>
            </Button>
          </div>

          <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-8 sm:grid-cols-4">
            {[
              { value: "R$ 97", label: "por tela ativa / mês" },
              { value: "Sua marca", label: "painel personalizável" },
              { value: "Tempo real", label: "publicou, trocou" },
              { value: "Android", label: "player em qualquer TV" },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="font-display text-2xl font-semibold text-primary">{stat.value}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          A ciência da atenção
        </p>
        <h2 className="mt-3 max-w-2xl text-2xl font-semibold sm:text-3xl">
          O desafio não é o seu produto. É ser notado.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PAIN_POINTS.map((item) => (
            <Card key={item.title} className="h-full">
              <CardContent className="pt-6">
                <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
                  <item.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Como funciona</p>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Três passos até a primeira tela</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((item) => (
            <Card key={item.step} className="h-full">
              <CardContent className="pt-6">
                <span className="grid size-10 place-items-center rounded-lg bg-primary font-display text-base font-semibold text-primary-foreground">
                  {item.step}
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Recursos</p>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
          Tudo o que a sua operação de telas precisa
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="h-full">
              <CardContent className="pt-6">
                <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="marca" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <Card className="signal-glow overflow-hidden">
          <CardContent className="grid gap-8 p-8 lg:grid-cols-2 lg:p-12">
            <div>
              <Palette className="size-6 text-primary" />
              <h2 className="mt-4 text-2xl font-semibold">O painel fica com a sua cara</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Suba o seu logo, escolha as cores da marca e entregue ao seu cliente final uma
                experiência que parece 100% sua. Ideal para agências, franquias e redes que revendem
                mídia indoor.
              </p>
              <Button asChild size="lg" className="mt-6">
                <Link to="/entrar">Personalizar minha conta</Link>
              </Button>
            </div>
            <ul className="space-y-3">
              {WHITE_LABEL.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section id="planos" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Planos</p>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
          Você paga por tela ativa. Simples assim.
        </h2>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Sem taxa de instalação e sem contrato longo. Ativou a tela, ela entra na fatura; pausou,
          ela sai.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={plan.highlight ? "signal-glow border-primary/60" : undefined}
            >
              <CardContent className="flex h-full flex-col pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold">{plan.name}</h3>
                  {plan.highlight ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      Mais escolhido
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 font-display text-3xl font-semibold">{plan.price}</p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.unit}</p>
                <ul className="mt-6 flex-1 space-y-2">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-6"
                  variant={plan.highlight ? "default" : "secondary"}
                >
                  <Link to="/entrar">Começar</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Dúvidas</p>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Perguntas frequentes</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map((item) => (
            <Card key={item.q} className="h-full">
              <CardContent className="pt-6">
                <h3 className="font-display text-base font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between lg:p-12">
            <div className="max-w-xl">
              <Smartphone className="size-6 text-primary" />
              <h2 className="mt-4 text-2xl font-semibold">Ative a sua primeira tela hoje</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Crie a conta, instale o player e veja o conteúdo no ar em minutos. Sem instalador,
                sem visita técnica.
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/entrar">Criar minha conta</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4" />
            MDI 360 — mídia digital indoor como serviço.
          </span>
          <Link to="/entrar" className="hover:text-foreground">
            Acessar minha conta
          </Link>
        </div>
      </footer>
    </div>
  );
}