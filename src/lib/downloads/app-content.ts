export type AppDownloadId = "android" | "roku" | "windows" | "linux";

export type AppDownloadLink = {
  label: string;
  href: string;
  secondary?: boolean;
};

export type AppDownloadContent = {
  enabled: boolean;
  title: string;
  cardDescription: string;
  cardDetail: string;
  pageDescription: string;
  downloadDescription: string;
  /** Legacy/default links are ignored until the platform owner edits this list in Tower. */
  downloadsManaged: boolean;
  downloads: AppDownloadLink[];
  steps: string[];
  notes: string[];
};

export type AppDownloadsContent = {
  heading: string;
  introduction: string;
  footer: string;
  apps: Record<AppDownloadId, AppDownloadContent>;
};

export const APP_DOWNLOAD_IDS: readonly AppDownloadId[] = ["android", "roku", "windows", "linux"];

export const DEFAULT_APP_DOWNLOADS_CONTENT: AppDownloadsContent = {
  heading: "Aplicativos e downloads",
  introduction:
    "Escolha o aparelho para acessar o download e o passo a passo completo de instalação.",
  footer:
    "Sem um aplicativo instalado, o player também funciona no navegador em /tela. Para emitir senhas pelo navegador, use /emitir.",
  apps: {
    android: {
      enabled: true,
      title: "Terminal Android MDI 360",
      cardDescription: "Para TV Box, Smart TV Android, tablet e totens de atendimento.",
      cardDetail:
        "Aplicativo híbrido para exibir mídias, emitir senhas e chamar atendimentos no mesmo aparelho.",
      pageDescription:
        "Aplicativo híbrido para terminais Android com reprodução de mídias, emissão e chamada de senhas.",
      downloadDescription: "Baixe o APK e instale diretamente no aparelho Android.",
      downloadsManaged: false,
      downloads: [],
      steps: [
        "Baixe o APK pelo botão acima e copie o arquivo para o aparelho Android.",
        "No aparelho, abra Configurações > Segurança e permita a instalação de aplicativos desconhecidos para o gerenciador de arquivos utilizado.",
        "Abra o APK, toque em Instalar e, ao terminar, toque em Abrir.",
        "Conceda as permissões solicitadas. Para impressão USB, conecte a impressora e autorize o acesso quando o Android perguntar.",
        "O aplicativo mostrará e, quando houver impressora autorizada, imprimirá um código de vinculação com 6 caracteres.",
        "No MDI 360 Studio, abra Terminais, informe o código, dê um nome ao aparelho e conclua a vinculação.",
        "Abra as configurações do terminal para selecionar a playlist e habilitar as funções de exibição, emissão ou chamada de senhas.",
        "No aplicativo, pressione F10 para abrir as configurações locais e mapear os botões físicos quando necessário.",
      ],
      notes: [
        "O aplicativo pode executar simultaneamente reprodução de mídias, emissão e chamada de senhas.",
        "O terminal inicia automaticamente com o Android depois que as permissões necessárias forem concedidas.",
        "Mantenha data, hora e fuso horário automáticos no Android.",
        "A primeira autorização de uma impressora USB normalmente exige confirmação no próprio aparelho.",
      ],
    },
    roku: {
      enabled: true,
      title: "Canal Roku",
      cardDescription: "Para aparelhos e TVs com sistema Roku.",
      cardDetail: "Canal instalado pelo modo desenvolvedor, com player e ativação nativos.",
      pageDescription: "Instalação manual pelo modo desenvolvedor da TV ou aparelho Roku.",
      downloadDescription: "Baixe o pacote ZIP sem descompactar.",
      downloadsManaged: false,
      downloads: [],
      steps: [
        "Na Roku, abra Configurações > Sistema > Sobre e anote o endereço IP.",
        "No controle, pressione: Home 3 vezes, Cima 2 vezes, Direita, Esquerda, Direita, Esquerda, Direita.",
        "Aceite os termos do modo desenvolvedor, defina uma senha e aguarde a Roku reiniciar.",
        "Em um computador na mesma rede, abra http://IP-DA-ROKU e entre com o usuário rokudev e a senha criada.",
        "Baixe o ZIP acima. Na página da Roku, selecione o arquivo em Upload e clique em Install / Replace.",
        "O canal mostrará um código. No Studio, abra Terminais, informe o código e conclua a vinculação.",
      ],
      notes: [
        "O computador e a Roku precisam estar na mesma rede durante a instalação.",
        "Não descompacte o arquivo ZIP antes de enviá-lo à Roku.",
        "O modo desenvolvedor permite um canal instalado por vez; Install / Replace substitui o anterior.",
        "Páginas web não são reproduzidas na Roku; vídeos, imagens e widgets compatíveis continuam funcionando.",
      ],
    },
    windows: {
      enabled: true,
      title: "Emissor de Senhas — Windows",
      cardDescription: "Totem de senhas e impressão térmica no Windows.",
      cardDetail: "Tela cheia, impressão automática e inicialização junto com o computador.",
      pageDescription: "Emissão em tela cheia e impressão térmica automática no mesmo aplicativo.",
      downloadDescription: "Baixe o instalador compatível com Windows x64.",
      downloadsManaged: false,
      downloads: [],
      steps: [
        "Baixe o instalador MDI360-Emissor-Windows-x64.exe.",
        "Abra o arquivo. Se o Windows SmartScreen aparecer, clique em Mais informações > Executar assim mesmo.",
        "Avance pelo instalador e conclua a instalação. O MDI 360 Emissor abrirá automaticamente.",
        "Confirme o servidor https://mdi.360bh.com.br, escolha a impressora e use ESC/POS direto para impressoras térmicas compatíveis.",
        "Clique em Imprimir teste e ajuste largura, margens e guilhotina até o cupom ficar correto.",
        "O aplicativo mostrará um código. No Studio, abra Senhas e atendimento, selecione a fila e vincule o emissor.",
        "Depois do vínculo, o emissor abrirá em tela cheia e o serviço de impressão continuará em segundo plano.",
      ],
      notes: [
        "O aplicativo inicia automaticamente quando o usuário entra no Windows.",
        "Pressione F10 para abrir as configurações.",
        "Pressione Ctrl+Shift+M para abrir o monitor de impressão.",
        "O modo Driver do Windows é uma alternativa quando a impressora não aceita ESC/POS direto.",
      ],
    },
    linux: {
      enabled: true,
      title: "Emissor de Senhas — MiniOS / Linux",
      cardDescription: "Totem de senhas e impressão térmica no MiniOS.",
      cardDetail:
        "Pacotes DEB e AppImage para Linux Debian x64, com inicialização automática e CUPS.",
      pageDescription:
        "Guia testado no MiniOS x64 com impressora térmica EPSON TM-T20. Faça uma etapa por vez.",
      downloadDescription: "Use o pacote DEB como primeira opção no MiniOS.",
      downloadsManaged: false,
      downloads: [],
      steps: [
        "Abra o Terminal e execute uname -m. O resultado deve ser x86_64.",
        "Confirme a persistência criando o arquivo com touch ~/teste-persistencia-minios, reinicie e verifique com ls ~/teste-persistencia-minios.",
        "Conecte a impressora e confirme a detecção com lsusb | grep -i epson.",
        "Execute sudo apt update e aguarde a conclusão.",
        "Instale a impressão com sudo apt install -y cups cups-client.",
        "Ative o serviço com sudo systemctl enable --now cups e confirme com systemctl is-active cups. O resultado esperado é active.",
        "Cadastre a impressora no CUPS e defina EPSON_TM_T20 como impressora padrão.",
        "Faça uma impressão de teste antes de instalar o emissor.",
        "Baixe o pacote DEB e instale com sudo apt install -y ~/Downloads/MDI360-Emissor-MiniOS-x64.deb.",
        "Abra o MDI 360 Emissor, selecione EPSON_TM_T20, mantenha ESC/POS direto e inicie o serviço.",
        "Aguarde o código de 6 caracteres e faça o vínculo em Senhas e atendimento no Studio.",
        "Emita uma senha de teste e reinicie o MiniOS para confirmar a abertura e impressão automáticas.",
      ],
      notes: [
        "Use o pacote DEB como primeira opção. O AppImage é destinado a usuários avançados.",
        "Os comandos foram testados com MiniOS x64 e EPSON TM-T20 conectada por USB.",
        "Mantenha o MiniOS conectado à internet durante a instalação e a operação.",
        "Pressione F10 para configurações, Ctrl+Shift+M para o monitor e Ctrl+Shift+Q para encerrar.",
      ],
    },
  },
};

function text(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function textList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return items.length ? items : fallback;
}

function isSafeDownloadHref(value: string) {
  return value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://");
}

function normalizeApp(value: unknown, fallback: AppDownloadContent): AppDownloadContent {
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<AppDownloadContent>;
  const downloadsManaged = source.downloadsManaged === true;
  const downloads =
    downloadsManaged && Array.isArray(source.downloads)
      ? source.downloads
          .filter((item): item is AppDownloadLink => Boolean(item && typeof item === "object"))
          .map((item) => ({
            label: text(item.label, "Download"),
            href: text(item.href, ""),
            secondary: Boolean(item.secondary),
          }))
          .filter((item) => item.label.trim() && item.href.trim() && isSafeDownloadHref(item.href))
      : fallback.downloads;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    title: text(source.title, fallback.title),
    cardDescription: text(source.cardDescription, fallback.cardDescription),
    cardDetail: text(source.cardDetail, fallback.cardDetail),
    pageDescription: text(source.pageDescription, fallback.pageDescription),
    downloadDescription: text(source.downloadDescription, fallback.downloadDescription),
    downloadsManaged,
    downloads,
    steps: textList(source.steps, fallback.steps),
    notes: textList(source.notes, fallback.notes),
  };
}

export function normalizeAppDownloadsContent(value: unknown): AppDownloadsContent {
  if (!value || typeof value !== "object") return DEFAULT_APP_DOWNLOADS_CONTENT;
  const source = value as Partial<AppDownloadsContent>;
  const apps: Partial<AppDownloadsContent["apps"]> =
    source.apps && typeof source.apps === "object" ? source.apps : {};
  return {
    heading: text(source.heading, DEFAULT_APP_DOWNLOADS_CONTENT.heading),
    introduction: text(source.introduction, DEFAULT_APP_DOWNLOADS_CONTENT.introduction),
    footer: text(source.footer, DEFAULT_APP_DOWNLOADS_CONTENT.footer),
    apps: {
      android: normalizeApp(apps.android, DEFAULT_APP_DOWNLOADS_CONTENT.apps.android),
      roku: normalizeApp(apps.roku, DEFAULT_APP_DOWNLOADS_CONTENT.apps.roku),
      windows: normalizeApp(apps.windows, DEFAULT_APP_DOWNLOADS_CONTENT.apps.windows),
      linux: normalizeApp(apps.linux, DEFAULT_APP_DOWNLOADS_CONTENT.apps.linux),
    },
  };
}
