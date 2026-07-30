# Canal Roku — MDI 360

Player nativo em BrightScript/SceneGraph para TVs Roku. Ele fala com o mesmo
servidor das demais telas: registra-se sozinho, mostra o código de ativação e
depois sincroniza a playlist a cada 60 segundos.

## O que o Roku suporta

| Conteúdo | Roku |
|---|---|
| Imagens (JPG/PNG/WebP) | Sim |
| Vídeos (MP4/H.264) | Sim |
| Páginas web (iframe) | Não — Roku não tem navegador |
| Widgets (relógio, clima, cotações, notícias) | Não no formato atual |

Itens não suportados são simplesmente pulados na playlist. Para levar widgets ao
Roku no futuro, o servidor precisa renderizá-los como imagem (screenshot server-side).

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