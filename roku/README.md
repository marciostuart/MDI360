# Canal Roku — MDI 360

Player nativo em BrightScript/SceneGraph para TVs Roku. Ele fala com o mesmo
servidor das demais telas: registra-se sozinho, mostra o código de ativação e
depois sincroniza a playlist a cada 60 segundos.

## O que o Roku suporta

| Conteúdo | Roku |
|---|---|
| Vídeos (MP4/H.264, HLS) | Sim — decodificação por hardware |
| Imagens (JPG/PNG/WebP) | Sim |
| Widgets (relógio, clima, cotações, notícias) | Sim — desenhados nativamente |
| Páginas web (iframe) | Não — Roku não tem navegador |

Os widgets **não** usam navegador: `WidgetView` desenha o mesmo layout com
componentes nativos do Roku e busca os dados no mesmo endpoint aberto
(`/api/public/widget-data`) usado pelo player web. Resultado: texto nítido,
consumo baixíssimo de memória e nenhuma dependência de WebView.

Somente itens do tipo *página web* são pulados na playlist.

## Como testar em uma TV Roku

1. Na TV: Configurações → Sistema → Avançado → **Modo desenvolvedor**. Anote o IP e a senha.
2. Gere o pacote:
   ```
   cd roku && zip -r ../mdi360-roku.zip . -x "*.DS_Store"
   ```
3. Abra `http://IP-DA-TV` no navegador, faça login com a senha e envie o zip em **Upload**.
4. O canal abre mostrando o código de ativação. Vincule pelo painel em **Telas**.

## Publicação na loja Roku

Conta de desenvolvedor Roku (gratuita) → Developer Dashboard → *Add Channel*.
Pode ser publicado como **canal privado** (link secreto por cliente, aprovação
imediata) ou **canal público** (revisão da Roku, alguns dias).

## Configuração

O endereço do servidor fica no campo `baseUrl` de `components/SyncTask.xml`.
Para revenda whitelabel, basta trocar `title` no `manifest` e as imagens em `images/`.

## Imagens necessárias

Coloque em `images/` antes de empacotar:

- `icon_focus_hd.png` (290x218)
- `icon_focus_sd.png` (248x140)
- `splash_hd.png` (1280x720)
- `splash_fhd.png` (1920x1080)