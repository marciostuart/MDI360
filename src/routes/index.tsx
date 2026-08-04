import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  ChevronDown,
  CirclePlay,
  Clock3,
  LayoutDashboard,
  Menu,
  MonitorPlay,
  Network,
  ScanLine,
  Sparkles,
  TicketCheck,
  X,
} from "lucide-react";
import { useState } from "react";

import { fetchLandingContent } from "@/lib/landing/landing.functions";

export const Route = createFileRoute("/")({
  loader: () => fetchLandingContent(),
  head: () => ({
    meta: [
      { title: "MDI 360 | Sinalização digital e atendimento inteligente" },
      {
        name: "description",
        content:
          "Gerencie telas, conteúdos, playlists, filas, totens e resultados em uma plataforma completa de sinalização digital.",
      },
      { property: "og:title", content: "MDI 360 | Toda tela pode fazer mais" },
      {
        property: "og:description",
        content:
          "Sinalização digital, atendimento por senhas e monitoramento em uma única plataforma.",
      },
    ],
  }),
  component: LandingPage,
});

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-[#a3ff3f] text-[#07100b]">
        <MonitorPlay className="size-5" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">MDI 360</span>
    </span>
  );
}

function LandingPage() {
  const content = Route.useLoaderData();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <main className="landing-shell min-h-screen overflow-hidden bg-[#070a08] text-[#f4f7f2]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#070a08]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 lg:px-10">
          <a href="#inicio" aria-label="MDI 360 - início">
            <Brand />
          </a>
          <nav className="hidden items-center gap-7 text-sm text-white/65 lg:flex">
            <a href="#plataforma" className="hover:text-white">
              Plataforma
            </a>
            <a href="#diferenciais" className="hover:text-white">
              Diferenciais
            </a>
            <a href="#publicos" className="hover:text-white">
              Para quem
            </a>
            <a href="#parceiros" className="hover:text-white">
              Revendas
            </a>
            <a href="#faq" className="hover:text-white">
              FAQ
            </a>
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              to="/entrar"
              search={{ mode: "login" }}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Entrar
            </Link>
            <Link
              to="/entrar"
              search={{ mode: "signup" }}
              className="rounded-full bg-[#a3ff3f] px-5 py-2.5 text-sm font-bold text-[#07100b] transition hover:scale-[1.03] hover:bg-[#b7ff68]"
            >
              Criar conta
            </Link>
          </div>
          <button
            className="grid size-10 place-items-center rounded-full border border-white/15 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen ? (
          <div className="border-t border-white/10 bg-[#070a08] p-5 lg:hidden">
            <div className="flex flex-col gap-4 text-lg">
              <a href="#plataforma" onClick={() => setMenuOpen(false)}>
                Plataforma
              </a>
              <a href="#diferenciais" onClick={() => setMenuOpen(false)}>
                Diferenciais
              </a>
              <a href="#parceiros" onClick={() => setMenuOpen(false)}>
                Revendas
              </a>
              <Link to="/entrar" search={{ mode: "login" }}>
                Entrar
              </Link>
              <Link
                to="/entrar"
                search={{ mode: "signup" }}
                className="rounded-xl bg-[#a3ff3f] px-4 py-3 text-center font-bold text-black"
              >
                Criar conta
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <section
        id="inicio"
        className="landing-grid relative px-5 pb-20 pt-36 lg:px-10 lg:pb-28 lg:pt-44"
      >
        <div className="landing-orb landing-orb-one" />
        <div className="landing-orb landing-orb-two" />
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
          <div className="landing-rise">
            <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#a3ff3f]/30 bg-[#a3ff3f]/10 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-[#b7ff68]">
              <Sparkles className="size-3.5" />
              {content.eyebrow}
            </p>
            <h1 className="max-w-4xl font-display text-[clamp(3.25rem,7vw,7.5rem)] font-semibold leading-[.88] tracking-[-.065em]">
              {content.headline}
              <span className="mt-2 block text-[#a3ff3f]">{content.highlightedHeadline}</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/62 lg:text-xl">
              {content.heroDescription}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/entrar"
                search={{ mode: "signup" }}
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#a3ff3f] px-7 py-4 font-bold text-[#07100b] transition hover:scale-[1.03]"
              >
                {content.primaryCta}
                <ArrowRight className="size-5 transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#plataforma"
                className="inline-flex items-center justify-center gap-3 rounded-full border border-white/20 px-7 py-4 font-semibold transition hover:bg-white/10"
              >
                <CirclePlay className="size-5" />
                {content.secondaryCta}
              </a>
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[.2em] text-white/35">
              {content.proofLine}
            </p>
          </div>
          <HeroVisual imageUrl={content.heroImageUrl} />
        </div>
      </section>

      <div className="landing-marquee border-y border-white/10 bg-[#a3ff3f] py-3 text-[#07100b]">
        <div>
          {[
            "PLAYLISTS INTELIGENTES",
            "MONITORAMENTO EM TEMPO REAL",
            "ATENDIMENTO POR SENHAS",
            "ALERTAS NO WHATSAPP",
            "PROVA DE EXIBIÇÃO",
            "GESTÃO MULTIEMPRESA",
          ]
            .concat([
              "PLAYLISTS INTELIGENTES",
              "MONITORAMENTO EM TEMPO REAL",
              "ATENDIMENTO POR SENHAS",
              "ALERTAS NO WHATSAPP",
            ])
            .map((label, i) => (
              <span key={`${label}-${i}`}>
                {label}
                <b>✦</b>
              </span>
            ))}
        </div>
      </div>

      <section className="border-b border-white/10 px-5 py-16 lg:px-10">
        <div className="mx-auto grid max-w-[1440px] gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-3">
          {content.stats.map((item) => (
            <div key={item.title} className="bg-[#0b100d] p-8">
              <strong className="font-display text-4xl text-[#a3ff3f]">{item.title}</strong>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/50">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="plataforma" className="px-5 py-24 lg:px-10 lg:py-36">
        <div className="mx-auto max-w-[1440px]">
          <SectionIntro
            number="01"
            label="Uma plataforma, toda a operação"
            title="Da campanha na tela à senha impressa."
            description="O MDI 360 conecta comunicação, atendimento e gestão. Menos ferramentas dispersas. Mais controle sobre cada ponto de contato."
          />
          <div className="mt-16 grid items-center gap-12 lg:grid-cols-2">
            <VisualPlaceholder
              imageUrl={content.platformImageUrl}
              label="Imagem da gestão de telas e playlists"
              variant="dashboard"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniFeature
                icon={LayoutDashboard}
                title="Gestão centralizada"
                text="Telas, playlists, conteúdos, agenda e relatórios no mesmo fluxo."
              />
              <MiniFeature
                icon={Clock3}
                title="Programação precisa"
                text="Conteúdo padrão, listas agendadas e sublistas com regras próprias."
              />
              <MiniFeature
                icon={ScanLine}
                title="Ativação simples"
                text="Vincule novos dispositivos com código alfanumérico, sem configuração técnica."
              />
              <MiniFeature
                icon={Network}
                title="Escala real"
                text="Uma tela, várias unidades ou uma carteira inteira de clientes."
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="diferenciais"
        className="bg-[#eef4e9] px-5 py-24 text-[#0a100c] lg:px-10 lg:py-36"
      >
        <div className="mx-auto max-w-[1440px]">
          <SectionIntro
            dark
            number="02"
            label="Diferenciais que aparecem na operação"
            title="Bonito na apresentação. Forte nos bastidores."
            description="Recursos desenhados para reduzir trabalho manual, antecipar problemas e comprovar resultado."
          />
          <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-black/10 bg-black/10 md:grid-cols-2 lg:grid-cols-3">
            {content.features.map((item, index) => (
              <article
                key={item.title}
                className="group min-h-64 bg-[#f7faf4] p-8 transition hover:bg-white"
              >
                <span className="text-xs font-bold text-black/35">0{index + 1}</span>
                <h3 className="mt-12 font-display text-2xl font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-3 leading-relaxed text-black/55">{item.description}</p>
                <ArrowRight className="mt-7 size-5 text-[#4f8e1f] transition group-hover:translate-x-2" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="publicos" className="px-5 py-24 lg:px-10 lg:py-36">
        <div className="mx-auto max-w-[1440px]">
          <SectionIntro
            number="03"
            label="Para cada cenário"
            title="Uma tecnologia. Vários negócios em movimento."
            description="A mesma base se adapta à comunicação de venda, informação institucional, espera e atendimento."
          />
          <div className="mt-16 grid gap-5 md:grid-cols-2">
            {content.audiences.map((item, index) => (
              <article
                key={item.title}
                className="landing-audience group relative overflow-hidden rounded-3xl border border-white/10 p-8 lg:p-10"
              >
                <span className="text-sm text-[#a3ff3f]">0{index + 1}</span>
                <h3 className="mt-16 font-display text-3xl font-semibold">{item.title}</h3>
                <p className="mt-4 max-w-lg leading-relaxed text-white/55">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 lg:px-10 lg:pb-36">
        <div className="mx-auto grid max-w-[1440px] items-center gap-12 rounded-[2rem] border border-white/10 bg-[#0d130f] p-6 lg:grid-cols-2 lg:p-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#a3ff3f]">
              Atendimento integrado
            </p>
            <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight lg:text-6xl">
              A espera também comunica.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/55">
              Totem em tela cheia, botões físicos ou toque, impressão térmica, prioridades, setores,
              operadores e chamada na TV — tudo conectado.
            </p>
            <ul className="mt-8 grid gap-3 text-sm text-white/75 sm:grid-cols-2">
              {[
                "Windows e MiniOS",
                "Impressão ESC/POS",
                "Código de vinculação",
                "Operação sem navegador",
              ].map((v) => (
                <li key={v} className="flex items-center gap-2">
                  <Check className="size-4 text-[#a3ff3f]" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
          <VisualPlaceholder
            imageUrl={content.queueImageUrl}
            label="Imagem do totem e painel de senhas"
            variant="queue"
          />
        </div>
      </section>

      <section
        id="parceiros"
        className="relative overflow-hidden bg-[#a3ff3f] px-5 py-24 text-[#07100b] lg:px-10 lg:py-32"
      >
        <div className="landing-partner-orb" />
        <div className="relative mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[1fr_.7fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em]">
              Para integradores e revendas
            </p>
            <h2 className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[.95] tracking-[-.045em] lg:text-8xl">
              {content.resellerTitle}
            </h2>
          </div>
          <div className="flex flex-col justify-end">
            <p className="text-lg leading-relaxed text-black/65">{content.resellerDescription}</p>
            <a
              href={content.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-[#07100b] px-6 py-3.5 font-bold text-white"
            >
              Falar sobre parceria <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <section id="faq" className="px-5 py-24 lg:px-10 lg:py-36">
        <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[.65fr_1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#a3ff3f]">
              Perguntas frequentes
            </p>
            <h2 className="mt-5 font-display text-5xl font-semibold tracking-tight">
              Antes de colocar sua comunicação em movimento.
            </h2>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {content.faqs.map((faq) => (
              <details key={faq.question} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-xl font-semibold">
                  {faq.question}
                  <ChevronDown className="size-5 shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="max-w-2xl pt-4 leading-relaxed text-white/55">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-8 lg:px-10">
        <div className="landing-final mx-auto max-w-[1440px] overflow-hidden rounded-[2rem] border border-white/10 px-6 py-20 text-center lg:py-28">
          <BellRing className="mx-auto size-10 text-[#a3ff3f]" />
          <h2 className="mx-auto mt-7 max-w-4xl font-display text-5xl font-semibold tracking-[-.04em] lg:text-8xl">
            {content.finalTitle}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/55">{content.finalDescription}</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/entrar"
              search={{ mode: "signup" }}
              className="rounded-full bg-[#a3ff3f] px-7 py-4 font-bold text-black"
            >
              Criar minha conta
            </Link>
            <a
              href={content.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/20 px-7 py-4 font-semibold"
            >
              Conversar com a 360BH
            </a>
          </div>
        </div>
      </section>

      <footer className="px-5 py-10 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-6 border-t border-white/10 pt-8 text-sm text-white/40 md:flex-row">
          <Brand />
          <p>© {new Date().getFullYear()} Márcio Stuart · 360BH · Todos os direitos reservados.</p>
        </div>
      </footer>
    </main>
  );
}

function SectionIntro({
  number,
  label,
  title,
  description,
  dark = false,
}: {
  number: string;
  label: string;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[.35fr_1fr]">
      <div
        className={`text-xs font-bold uppercase tracking-[.2em] ${dark ? "text-black/40" : "text-[#a3ff3f]"}`}
      >
        [{number}] {label}
      </div>
      <div>
        <h2 className="max-w-5xl font-display text-5xl font-semibold leading-[.98] tracking-[-.045em] lg:text-7xl">
          {title}
        </h2>
        <p
          className={`mt-6 max-w-2xl text-lg leading-relaxed ${dark ? "text-black/55" : "text-white/55"}`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function MiniFeature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof BarChart3;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-6">
      <Icon className="size-5 text-[#a3ff3f]" />
      <h3 className="mt-8 font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/50">{text}</p>
    </div>
  );
}

function HeroVisual({ imageUrl }: { imageUrl: string }) {
  if (imageUrl)
    return (
      <div className="landing-float relative">
        <img
          src={imageUrl}
          alt="Plataforma MDI 360"
          className="w-full rounded-[2rem] border border-white/15 object-cover shadow-2xl"
        />
      </div>
    );
  return (
    <div className="landing-float relative mx-auto w-full max-w-[680px]">
      <div className="absolute -inset-5 rounded-[2.5rem] bg-[#a3ff3f]/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[#101612] p-3 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
          <i className="size-2 rounded-full bg-[#ff6b5f]" />
          <i className="size-2 rounded-full bg-[#ffd45f]" />
          <i className="size-2 rounded-full bg-[#a3ff3f]" />
          <span className="ml-auto text-[10px] uppercase tracking-widest text-white/30">
            Visão geral
          </span>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-[.3fr_1fr]">
          <div className="hidden space-y-3 rounded-xl bg-white/[.04] p-4 sm:block">
            {["Telas", "Conteúdos", "Playlists", "Agenda", "Senhas"].map((v, i) => (
              <div
                key={v}
                className={`rounded-lg px-3 py-2 text-xs ${i === 0 ? "bg-[#a3ff3f] font-bold text-black" : "text-white/35"}`}
              >
                {v}
              </div>
            ))}
          </div>
          <div>
            <div className="grid grid-cols-3 gap-3">
              {["Online", "Campanhas", "Exibições"].map((v, i) => (
                <div key={v} className="rounded-xl border border-white/8 bg-white/[.04] p-3">
                  <span className="text-[10px] text-white/35">{v}</span>
                  <strong className="mt-3 block text-xl text-[#a3ff3f]">
                    {["18", "24", "12,8k"][i]}
                  </strong>
                </div>
              ))}
            </div>
            <div className="mt-3 grid aspect-[16/9] place-items-center rounded-xl bg-[radial-gradient(circle_at_70%_30%,rgba(163,255,63,.22),transparent_35%),linear-gradient(135deg,#17221a,#0a0d0b)]">
              <div className="text-center">
                <MonitorPlay className="mx-auto size-12 text-[#a3ff3f]" />
                <strong className="mt-3 block font-display text-2xl">Sua rede. Ao vivo.</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualPlaceholder({
  imageUrl,
  label,
  variant,
}: {
  imageUrl: string;
  label: string;
  variant: "dashboard" | "queue";
}) {
  if (imageUrl)
    return (
      <img
        src={imageUrl}
        alt={label}
        className="w-full rounded-3xl border border-white/10 object-cover"
      />
    );
  return (
    <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-3xl border border-dashed border-white/20 bg-[linear-gradient(135deg,rgba(163,255,63,.08),rgba(255,255,255,.02))] p-8">
      <div className="text-center">
        {variant === "queue" ? (
          <TicketCheck className="mx-auto size-16 text-[#a3ff3f]" />
        ) : (
          <BarChart3 className="mx-auto size-16 text-[#a3ff3f]" />
        )}
        <p className="mt-5 text-sm font-semibold text-white/65">{label}</p>
        <p className="mt-2 text-xs text-white/30">Insira a URL no editor da Torre de Controle</p>
      </div>
    </div>
  );
}
