import { createFileRoute } from "@tanstack/react-router";
import { Laptop } from "lucide-react";
import type { ReactNode } from "react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { APP_DOWNLOADS } from "@/lib/app-downloads";

export const Route = createFileRoute("/studio/instalar/emissor-linux")({
  head: () => ({ meta: [{ title: "Instalar Emissor MiniOS Linux | MDI 360" }] }),
  component: LinuxGuide,
});

function Command({ children }: { children: ReactNode }) {
  return (
    <code className="mt-2 block overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs text-foreground">
      {children}
    </code>
  );
}

function LinuxGuide() {
  return (
    <InstallGuide
      title="Emissor de Senhas — MiniOS / Linux"
      description="Guia completo, testado no MiniOS x64 com a impressora térmica EPSON TM-T20. Faça uma etapa por vez."
      icon={<Laptop className="size-6" />}
      downloads={[
        { label: "Baixar instalador MiniOS (.deb)", href: APP_DOWNLOADS.linuxDeb },
        { label: "Baixar versão portátil (.AppImage)", href: APP_DOWNLOADS.linuxAppImage, secondary: true },
      ]}
      steps={[
        <>
          <strong>Confirme que o computador é compatível.</strong> Abra o Terminal pelo menu do MiniOS e execute:
          <Command>uname -m</Command>
          O resultado deve ser <strong>x86_64</strong>.
        </>,
        <>
          <strong>Confirme a persistência do pendrive.</strong> Crie um arquivo de teste, reinicie o MiniOS e verifique se ele continua existindo:
          <Command>touch ~/teste-persistencia-minios</Command>
          Depois de reiniciar, execute <Command>ls ~/teste-persistencia-minios</Command>
          Se o caminho do arquivo aparecer, pode continuar. Sem persistência, a instalação será perdida ao desligar.
        </>,
        <>
          <strong>Conecte a impressora.</strong> Ligue a EPSON TM-T20, coloque papel e conecte o cabo USB. Confirme a detecção:
          <Command>lsusb | grep -i epson</Command>
          O resultado deve mencionar <strong>EPSON</strong> ou <strong>TM-T20</strong>.
        </>,
        <>
          <strong>Instale o sistema de impressão.</strong> Execute os dois comandos abaixo, um por vez, e espere cada um terminar:
          <Command>sudo apt update</Command>
          <Command>sudo apt install -y cups cups-client</Command>
        </>,
        <>
          <strong>Ative a impressão automática.</strong> Execute:
          <Command>sudo systemctl enable --now cups</Command>
          Depois confirme com <Command>systemctl is-active cups</Command>
          O resultado esperado é <strong>active</strong>.
        </>,
        <>
          <strong>Cadastre a EPSON no CUPS.</strong> Copie e execute o comando completo abaixo. Ele encontra automaticamente a impressora USB:
          <Command>{`EPSON_URI="$(sudo /usr/sbin/lpinfo -v | awk 'toupper($0) ~ /EPSON|TM-T20/ {print $2; exit}')" && sudo /usr/sbin/lpadmin -p EPSON_TM_T20 -E -v "$EPSON_URI" -m raw`}</Command>
          O aviso <em>Raw queues are deprecated</em> pode ser ignorado.
        </>,
        <>
          <strong>Defina a impressora como padrão.</strong> Execute:
          <Command>lpoptions -d EPSON_TM_T20</Command>
          Procure por <strong>printer-is-accepting-jobs=true</strong> no resultado.
        </>,
        <>
          <strong>Faça uma impressão de teste.</strong> Execute:
          <Command>{`printf '\\x1b\\x40\\nMDI 360\\nTeste de impressao MiniOS\\n\\n\\n\\n\\n\\x1d\\x56\\x00' | lp -d EPSON_TM_T20 -o raw`}</Command>
          A impressora deve imprimir a mensagem e cortar o papel.
        </>,
        <>
          <strong>Instale o MDI360 Emissor.</strong> Baixe o pacote <strong>.deb</strong> pelo botão no início desta página. Abra a pasta Downloads, dê dois cliques no arquivo e escolha <strong>Instalar</strong>. Se preferir o Terminal, execute:
          <Command>sudo apt install -y ~/Downloads/MDI360-Emissor-MiniOS-x64.deb</Command>
        </>,
        <>
          <strong>Abra e configure o aplicativo.</strong> No menu do MiniOS, procure por <strong>MDI360 Emissor</strong>. Selecione <strong>EPSON_TM_T20</strong>, mantenha o modo <strong>ESC/POS direto</strong> e clique em <strong>Iniciar serviço</strong>.
        </>,
        <>
          <strong>Vincule o terminal.</strong> Aguarde o código alfanumérico de 6 caracteres. Em outro computador, abra <strong>Studio → Senhas</strong>, informe esse código na configuração do emissor e confirme.
        </>,
        <>
          <strong>Faça a verificação final.</strong> O emissor deve abrir em tela cheia. Emita uma senha de teste e reinicie o MiniOS para confirmar que o aplicativo abre automaticamente e continua imprimindo.
        </>,
      ]}
      notes={[
        "Use o pacote DEB como primeira opção. O AppImage é uma alternativa portátil para usuários avançados.",
        "Os comandos desta página foram testados com MiniOS x64 e EPSON TM-T20 conectada por USB.",
        "Mantenha o MiniOS conectado à internet durante a instalação e a operação do emissor.",
        "Pressione F10 para abrir as configurações, Ctrl+Shift+M para abrir o monitor e Ctrl+Shift+Q para encerrar o aplicativo.",
        "O aplicativo inicia automaticamente na sessão gráfica do MiniOS depois da primeira configuração.",
      ]}
    />
  );
}
