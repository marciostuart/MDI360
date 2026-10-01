# Contrato do player local Android 1.5.0

O código Kotlin e o projeto Android permanecem exclusivamente em `marciostuart/totem-tvbox`. Este repositório contém o servidor e a fonte React dos templates compartilhados, gerados para inclusão no APK, sem executar o site `/tela` como controlador da programação nativa.

- `/player/sync` envia identidades estáveis de conteúdo (`cacheKey`), limites de exibição e restrições das playlists aninhadas. `preparationPending` impede promover um plano incompleto enquanto um arquivo ainda está em upload/processamento.
- `/player/playback` mantém navegador/Roku compatíveis. O APK envia `eventId` UUID persistente: início, término e tentativas repetidas atualizam uma única linha. A resposta confirma o UUID antes de o APK remover o evento do SQLite. Eventos continuam sujeitos à janela de horário válida existente (31 dias).
- Início registra `completed:false` e duração zero; término atualiza a mesma linha com duração real. Uma conclusão recebida antes da tentativa de início não é revertida pelo início atrasado.
- Não há migração PostgreSQL nesta atualização: a chave primária UUID já existente garante idempotência. Atualizar servidor antes do APK.
- Templates offline recebem dados pelo contexto `LocalWidgetData`; não fazem polling HTTP. Mídias e imagens de notícias são preparadas no armazenamento privado pelo coordenador Android, mantendo personalização, dezenas de loteria e sequência das manchetes.

## Validação

`npm run check` (build + lint), `npm run test:billing` (32 testes) e `npm run build:native-player && node scripts/test-native-renderer.mjs` (6 cenários reais de renderização em Chromium). O teste de renderer usa fixtures locais, sem credenciais nem dados de clientes; `CHROME_PATH` pode apontar para outra instalação Chromium.

A checagem TypeScript global possui pendências anteriores em configurações/widgets e rotas de conta; não equivale a uma compilação TypeScript sem erros. Build de produção e testes são a validação automatizada realizada nesta atualização.

Ainda é necessário teste físico no TV Box afetado: reprodução prolongada, cold-start sem rede, reconexão, edição durante vídeo, emissão/chamada/impressão e captura de tela. Compilação e Chromium não comprovam o comportamento dos decoders de cada firmware.
