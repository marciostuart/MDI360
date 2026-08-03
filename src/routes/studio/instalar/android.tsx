import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { APP_DOWNLOADS } from "@/lib/app-downloads";

export const Route = createFileRoute("/studio/instalar/android")({
  head: () => ({ meta: [{ title: "Instalar Player Android | MDI 360" }] }),
  component: AndroidGuide,
});

function AndroidGuide() {
  return (
    <InstallGuide
      title="Player Android"
      description="TV Box, Smart TV Android, tablet ou celular Android."
      icon={<Smartphone className="size-6" />}
      downloads={[{ label: "Baixar APK Android", href: APP_DOWNLOADS.android }]}
      steps={[
        <>Baixe o arquivo <strong>mdi360-android.apk</strong> usando o botão acima.</>,
        <>No aparelho, abra <strong>Configurações → Segurança</strong> e permita “Fontes desconhecidas” ou “Instalar apps desconhecidos” para o navegador/gerenciador de arquivos.</>,
        <>Abra o arquivo baixado e toque em <strong>Instalar</strong>. Se o Android pedir confirmação, escolha “Instalar mesmo assim”.</>,
        <>Ao final, toque em <strong>Abrir</strong>. O player ocupará a tela e mostrará um código de ativação com 6 caracteres.</>,
        <>No MDI360 Studio, abra <strong>Telas → Vincular tela</strong>, informe o código, dê um nome ao aparelho e escolha sua playlist.</>,
        <>Aguarde alguns segundos. O aparelho sairá da ativação e iniciará a programação automaticamente.</>,
      ]}
      notes={[
        "O aplicativo inicia automaticamente quando o aparelho Android é ligado.",
        "Cada aparelho vinculado utiliza uma vaga de tela do plano.",
        "Para trocar o aparelho sem perder a programação, use a opção Substituir em Telas.",
        "Mantenha data, hora e fuso horário automáticos no Android.",
      ]}
    />
  );
}
