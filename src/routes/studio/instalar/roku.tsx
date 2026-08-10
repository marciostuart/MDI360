import { createFileRoute } from "@tanstack/react-router";
import { Tv2 } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { APP_DOWNLOADS } from "@/lib/app-downloads";

export const Route = createFileRoute("/studio/instalar/roku")({
  head: () => ({ meta: [{ title: "Instalar Canal Roku | MDI 360" }] }),
  component: RokuGuide,
});

function RokuGuide() {
  return (
    <InstallGuide
      title="Canal Roku"
      description="Instalação manual pelo modo desenvolvedor da TV ou aparelho Roku."
      icon={<Tv2 className="size-6" />}
      downloads={[{ label: "Baixar canal Roku (.zip)", href: APP_DOWNLOADS.roku }]}
      steps={[
        <>
          Na Roku, abra <strong>Configurações → Sistema → Sobre</strong> e anote o endereço IP.
        </>,
        <>
          No controle, pressione:{" "}
          <strong>Home 3 vezes, Cima 2 vezes, Direita, Esquerda, Direita, Esquerda, Direita</strong>
          .
        </>,
        <>Aceite os termos do modo desenvolvedor, defina uma senha e aguarde a Roku reiniciar.</>,
        <>
          Em um computador conectado à mesma rede, abra <strong>http://IP-DA-ROKU</strong>. Entre
          com usuário <strong>rokudev</strong> e a senha criada.
        </>,
        <>
          Baixe o ZIP acima. Na página da Roku, escolha o arquivo em <strong>Upload</strong> e
          clique em <strong>Install / Replace</strong>.
        </>,
        <>
          O canal mostrará um código. No Studio, abra <strong>Terminais</strong> e informe esse
          código.
        </>,
      ]}
      notes={[
        "O computador e a Roku precisam estar na mesma rede durante a instalação.",
        "Não descompacte o arquivo ZIP antes de enviá-lo à Roku.",
        "O modo desenvolvedor permite um canal instalado por vez; Install / Replace substitui o anterior.",
        "Páginas web não são reproduzidas na Roku; vídeos, imagens e widgets compatíveis continuam funcionando.",
      ]}
    />
  );
}
