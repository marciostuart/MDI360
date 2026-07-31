import { createFileRoute } from "@tanstack/react-router";
import { Download, MonitorPlay, Smartphone, Tv2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/studio/downloads")({
  head: () => ({
    meta: [
      { title: "Downloads e instalação | MDI 360" },
      {
        name: "description",
        content:
          "Baixe os aplicativos MDI 360 para Android e Roku e siga o passo a passo de instalação e ativação das telas.",
      },
      { property: "og:title", content: "Downloads e instalação | MDI 360" },
      {
        property: "og:description",
        content: "Aplicativos Android e Roku do MDI 360 com instruções completas de ativação.",
      },
    ],
  }),
  component: DownloadsPage,
});

const ANDROID_STEPS = [
  "No aparelho (TV Box, Smart TV Android ou celular), abra Configurações → Segurança e ative “Fontes desconhecidas” / “Instalar apps desconhecidos”.",
  "Copie o arquivo .apk para o aparelho por pen drive, ou baixe direto pelo navegador da TV usando o link desta página.",
  "Abra o arquivo .apk e toque em Instalar. Ao final, toque em Abrir.",
  "O app mostra na tela um código de ativação alfanumérico (ex.: A1B2C3).",
  "No Studio, acesse Telas → Vincular tela, digite o código, dê um nome à tela e escolha a playlist.",
  "Em poucos segundos a tela sai do modo de espera e começa a reproduzir. Mantenha o aparelho ligado na energia e na internet.",
];

const ROKU_STEPS = [
  "No controle do Roku, vá em Configurações → Sistema → Sobre e anote o endereço IP do aparelho.",
  "Ative o modo desenvolvedor: no controle aperte Home 3x, Cima 2x, Direita, Esquerda, Direita, Esquerda, Direita. Aceite os termos e defina uma senha.",
  "No computador (mesma rede do Roku), abra o navegador em http://IP-DO-ROKU e entre com usuário “rokudev” e a senha definida.",
  "Baixe o arquivo mdi360-roku.zip nesta página, selecione-o em “Upload” e clique em Install / Replace.",
  "O canal abre automaticamente e mostra o código de ativação alfanumérico na TV.",
  "No Studio, acesse Telas → Vincular tela, informe o código, nomeie a tela e selecione a playlist.",
];

const ACTIVATION_STEPS = [
  "Cada tela consome 1 vaga do seu plano. Se o limite estiver atingido, remova uma tela antiga antes de vincular a nova.",
  "Para trocar de aparelho sem refazer a programação, use o botão Substituir em Telas: informe o código da nova tela e toda a programação é transferida automaticamente.",
  "Ao remover uma tela, o aparelho apaga o cache local e volta a exibir um novo código de ativação.",
  "O som dos vídeos pode ser controlado por item da playlist e também de forma global por tela, em Telas.",
  "Se a tela ficar parada, ela se recupera sozinha em até 2 minutos pelo monitoramento automático. Reinicie o aparelho apenas se o problema persistir.",
];

function StepList({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="space-y-3 text-sm text-muted-foreground">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function DownloadsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Downloads e instalação</h1>
        <p className="text-sm text-muted-foreground">
          Baixe o aplicativo do seu aparelho e siga o passo a passo para instalar e ativar a tela.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="size-4 text-primary" />
              App Android (TV Box e Smart TV)
            </CardTitle>
            <CardDescription>
              Arquivo .apk para instalação manual em TV Box, Smart TV Android e celulares.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <a href="/mdi360-android.apk" download>
                <Download className="size-4" />
                Baixar APK Android
              </a>
            </Button>
            <StepList steps={ANDROID_STEPS} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tv2 className="size-4 text-primary" />
              Canal Roku
            </CardTitle>
            <CardDescription>
              Pacote .zip instalado pelo modo desenvolvedor do Roku, sem loja de aplicativos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <a href="/mdi360-roku.zip" download>
                <Download className="size-4" />
                Baixar canal Roku (.zip)
              </a>
            </Button>
            <StepList steps={ROKU_STEPS} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MonitorPlay className="size-4 text-primary" />
            Ativação e boas práticas
            <Badge variant="secondary">Importante</Badge>
          </CardTitle>
          <CardDescription>
            Regras de vínculo, substituição de aparelho e recuperação automática das telas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepList steps={ACTIVATION_STEPS} />
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="py-5 text-sm text-muted-foreground">
          Sem aparelho em mãos? Você também pode usar qualquer computador ou notebook como tela:
          abra{" "}
          <a className="font-medium text-primary" href="/tela" target="_blank" rel="noreferrer">
            /tela
          </a>{" "}
          no navegador em tela cheia e vincule o código exibido.
        </CardContent>
      </Card>
    </div>
  );
}
