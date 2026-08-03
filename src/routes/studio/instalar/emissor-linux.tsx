import { createFileRoute } from "@tanstack/react-router";
import { Laptop } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { APP_DOWNLOADS } from "@/lib/app-downloads";

export const Route = createFileRoute("/studio/instalar/emissor-linux")({
  head: () => ({ meta: [{ title: "Instalar Emissor MiniOS Linux | MDI 360" }] }),
  component: LinuxGuide,
});

function LinuxGuide() {
  return (
    <InstallGuide
      title="Emissor de Senhas — MiniOS / Linux"
      description="Instalação recomendada para MiniOS e outros sistemas Debian x64."
      icon={<Laptop className="size-6" />}
      downloads={[
        { label: "Baixar instalador MiniOS (.deb)", href: APP_DOWNLOADS.linuxDeb },
        { label: "Baixar versão portátil (.AppImage)", href: APP_DOWNLOADS.linuxAppImage, secondary: true },
      ]}
      steps={[
        <>Confirme que o MiniOS foi iniciado com <strong>persistência</strong>, para não perder o aplicativo e as configurações ao reiniciar.</>,
        <>Baixe o arquivo <strong>MDI360-Emissor-MiniOS-x64.deb</strong> usando o botão acima.</>,
        <>Abra a pasta Downloads e dê dois cliques no arquivo. No instalador de pacotes, clique em <strong>Instalar</strong> e informe a senha do MiniOS, se solicitada.</>,
        <>Abra o menu de aplicativos e procure por <strong>MDI360 Emissor</strong>. Inicie o aplicativo.</>,
        <>Na configuração, escolha a impressora, mantenha “ESC/POS direto” e clique em <strong>Imprimir teste</strong>.</>,
        <>O aplicativo mostrará um código de 6 caracteres. No Studio, abra <strong>Senhas</strong>, localize a tela e informe o código.</>,
        <>Após o vínculo, o emissor ficará em tela cheia e iniciará automaticamente nas próximas sessões do MiniOS.</>,
      ]}
      notes={[
        <>A impressão direta usa o sistema CUPS. Se nenhuma impressora aparecer, instale <strong>cups</strong> e <strong>cups-client</strong> pelo gerenciador de pacotes.</>,
        "Use o pacote DEB como primeira opção. O AppImage é uma alternativa portátil.",
        "Pressione F10 para abrir as configurações e Ctrl+Shift+M para ver o monitor de impressão.",
        "A versão disponibilizada é para computadores x64 (Intel ou AMD de 64 bits).",
      ]}
    />
  );
}
