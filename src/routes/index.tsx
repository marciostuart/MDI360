import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  Cloud,
  Images,
  ListVideo,
  MonitorPlay,
  Radio,
  ShieldCheck,
  Tv,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SinalDigital — Sinalização digital auto-hospedada" },
      {
        name: "description",
        content:
          "Controle todas as suas TVs a partir de um painel único: playlists, agendamentos e monitoramento em tempo real, rodando na sua própria VPS.",
      },
      { property: "og:title", content: "SinalDigital — Sinalização digital auto-hospedada" },
      {
        property: "og:description",
        content:
          "Playlists, agendamentos e monitoramento em tempo real das suas telas, na sua própria infraestrutura.",
      },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Tv,
    title: "Telas sob controle",
    body: "Pareie cada aparelho Android com um código, veja quem está online e envie comandos remotos.",
  },
  {
    icon: Images,
    title: "Biblioteca de mídias",
    body: "Imagens e vídeos ficam no seu MinIO, entregues às telas por links temporários.",
  },
  {
    icon: ListVideo,
    title: "Playlists flexíveis",
    body: "Monte a sequência de exibição com duração por item e publique em várias telas de uma vez.",
  },
  {
    icon: CalendarClock,
    title: "Agendamento por horário",
    body: "Menu no almoço, promoções à noite. Cada janela de horário toca a playlist certa.",
  },
  {
    icon: Radio,
    title: "Tempo real de verdade",
    body: "Atualizações chegam na hora via SSE, sem precisar reiniciar nada na loja.",
  },
  {
    icon: ShieldCheck,
    title: "Multiempresa isolada",
    body: "Cada organização vê apenas os próprios dados, com papéis de dono, administrador e operador.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MonitorPlay className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold">SinalDigital</span>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/entrar">Entrar</Link>
        </Button>
      </header>

      <section className="relative overflow-hidden">
        <div className="console-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 lg:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-signal-online" />
            100% auto-hospedado na sua VPS
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
            Todas as suas telas, um único painel.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Sinalização digital multiempresa com playlists, agendamentos e monitoramento em tempo
            real. Seus dados no seu Postgres, suas mídias no seu MinIO.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/entrar">Criar minha conta</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/painel">Ver o painel</Link>
            </Button>
          </div>

          <dl className="mt-16 grid max-w-2xl grid-cols-2 gap-8 sm:grid-cols-3">
            {[
              { value: "SSE", label: "Comandos em tempo real" },
              { value: "APK", label: "Player Android dedicado" },
              { value: "Docker", label: "Deploy no seu Portainer" },
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
        <h2 className="text-2xl font-semibold sm:text-3xl">O que o sistema faz</h2>
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

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Card className="signal-glow overflow-hidden">
          <CardContent className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between lg:p-12">
            <div className="max-w-xl">
              <Cloud className="size-6 text-primary" />
              <h2 className="mt-4 text-2xl font-semibold">Roda na sua infraestrutura</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Uma única imagem Docker, publicada com Traefik e HTTPS automático. Conecta no
                Postgres e no MinIO que você já tem rodando.
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/entrar">Começar agora</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          SinalDigital — sinalização digital auto-hospedada.
        </div>
      </footer>
    </div>
  );
}