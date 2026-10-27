# Preparação local de transições Android — 27/10/2026

A partir do APK 1.5.28, `native-player/main.tsx` recebe `nextPlaybackId` e
`nextItem` do controlador Android. Um próximo widget pode ser montado oculto
e com `isActive=false`, exclusivamente com dados e imagens locais.

Esse widget não anuncia `visualReady`, não gera relatório e não avança sua
rotação enquanto oculto. A promoção mantém a mesma chave/instância DOM;
revisões diferentes dos dados devem refazer a preparação. O widget anterior
permanece congelado até o conteúdo novo estar pronto.

Vídeos continuam em um único ExoPlayer/SurfaceView nativo. Imagens usam o
ImageView nativo. Nunca criar vídeo HTML ou outro decoder para pré-carregar.
A cobertura preta nativa de 500 ms e a camada superior de chamadas não são
alteradas por essa preparação. Web/Roku não usam esse renderer local.

Validar `npm run build`, `npm run build:native-player`,
`node scripts/test-native-renderer.mjs` e regenerar o bundle no repositório do
APK com `scripts/update-local-renderer.ps1`. A fixture
`lottery-warm-handoff` cobre preparação oculta, ausência de rotação antecipada,
promoção sem remontagem e início da rotação somente após ativar.

A mudança efetiva no Box é distribuída no APK; não é necessário atualizar a
Stack para instalar o renderer embarcado. Não alterar os editores de widgets
nem o serviço de chamadas para habilitar essa preparação.
