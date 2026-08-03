import { createFileRoute } from "@tanstack/react-router";
import { MonitorDown } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { APP_DOWNLOADS } from "@/lib/app-downloads";

export const Route = createFileRoute("/studio/instalar/emissor-windows")({
  head: () => ({ meta: [{ title: "Instalar Emissor Windows | MDI 360" }] }),
  component: WindowsGuide,
});

function WindowsGuide() {
  return (
    <InstallGuide
      title="Emissor de Senhas — Windows"
      description="Emissão em tela cheia e impressão térmica automática no mesmo aplicativo."
      icon={<MonitorDown className="size-6" />}
      downloads={[{ label: "Baixar instalador Windows", href: APP_DOWNLOADS.windows }]}
      steps={[
        <>Baixe o instalador <strong>MDI360-Emissor-Windows-x64.exe</strong>.</>,
        <>Abra o arquivo. Se o Windows SmartScreen aparecer, clique em <strong>Mais informações → Executar assim mesmo</strong>.</>,
        <>Avance pelo instalador e conclua a instalação. O MDI360 Emissor abrirá automaticamente.</>,
        <>Na configuração, confirme o endereço <strong>https://mdi.360bh.com.br</strong>, escolha a impressora e use “ESC/POS direto” para impressoras térmicas compatíveis.</>,
        <>Clique em <strong>Imprimir teste</strong>. Ajuste largura, margens e guilhotina até o cupom ficar correto.</>,
        <>O aplicativo mostrará um código de 6 caracteres. No Studio, abra <strong>Senhas</strong>, localize a tela desejada e vincule esse código.</>,
        <>Depois do vínculo, o emissor abrirá em tela cheia e o serviço de impressão continuará rodando em segundo plano.</>,
      ]}
      notes={[
        "O aplicativo inicia automaticamente quando o usuário entra no Windows.",
        "Pressione F10 para abrir as configurações.",
        "Pressione Ctrl+Shift+M para abrir o monitor de impressão.",
        "O modo Driver do Windows é uma alternativa quando a impressora não aceita ESC/POS direto.",
      ]}
    />
  );
}
