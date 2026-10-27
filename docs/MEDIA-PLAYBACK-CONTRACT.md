# Contrato de mídia e reprodução — 27/10/2026

## Ponto de retorno e limites da validação

Antes desta revisão: servidor `9b338ec`, APK `af8f16c` (1.5.25).
O estado anterior tinha regressões confirmadas; esses commits são referências
de reversão, não atestados de estabilidade. Código Android permanece somente
no repositório `totem-tvbox`; este repositório mantém o servidor, Roku e a fonte
dos templates React que são compilados para o APK.

## Arquivos publicados pelo servidor

- Vídeo MP4, AVC/H.264 compatível com Main Level 4.1, 8 bits `yuv420p`, sem
  B-frames, até 30 FPS, AAC-LC estéreo 48 kHz, `faststart`.
- Cadências abaixo de 30 FPS, inclusive 24000/1001 e 30000/1001, são preservadas;
  fontes acima de 30 FPS são reduzidas para o teto compartilhado. Não forçar
  fontes 24/25 FPS a 30. CRF 18, pico 10 Mbit/s, buffer 20 Mbit/s: compressão de
  alta qualidade, não uma promessa de vídeo matematicamente sem perdas.
- Imagens de playlist: PNG, sem compressão destrutiva adicional, incluindo
  transparência. Android, navegador e Roku não dependem do suporte a WebP de
  versões recentes do Roku OS para novos uploads.
  PNG pode ocupar mais espaço que WebP; a cota considera o arquivo final e o
  cache local evita baixar a mesma imagem a cada exibição.
- Teto horizontal 1920×1080, vertical 1080×1920; preservar proporção e nunca
  ampliar fontes menores. Presets ultrawide/tall mantêm a proporção com teto
  1920×540 / 540×1920. Validar o modo vertical nos modelos Roku destinados a ele.
- Upload e substituição passam pelo mesmo normalizador. `ffprobe` valida a
  saída; dimensões e duração gravadas vêm do arquivo efetivo, não do formulário.
- Falha/ausência de ffmpeg/ffprobe impede publicar a mídia como pronta. Nunca
  disfarçar original WebM/codec incompatível com extensão MP4. Substituição
  fracassada mantém o arquivo anterior. Conferir também a cota após conversão.
- A mudança não recodifica automaticamente conteúdos antigos. Conteúdos fora
  desse contrato devem ser substituídos pelo fluxo normal, com chave nova;
  a chave invalida o cache dos terminais sem apagar o vínculo.

Especificações de referência: [Roku](https://developer.roku.com/dev/docs/media)
e [Android](https://developer.android.com/media/platform/supported-formats).
Compatibilidade de formato não substitui teste no firmware de cada modelo.

## Responsabilidades no APK

1. `OfflinePlaybackController`: sequência local, duração, agendamento e
   relatórios. A imagem usa `showImage`; a imagem nativa decodificada é quem
   confirma prontidão. O template React não contém um player de imagens/vídeos.
2. `StableNativeMediaPlayer`: um ExoPlayer + SurfaceView para vídeo, ImageView
   com bitmap completo para imagens. Vídeo termina por `STATE_ENDED`; não
   avançar apenas porque o temporizador da cobertura chegou a 500 ms.
3. `MainActivity.nativeTransitionCover`: única animação de playlist, fechando
   em 500 ms e abrindo em 500 ms após prontidão do sucessor. Renderizadores de
   mídia/widgets fazem corte; não adicionam fade próprio. Chamadas continuam
   acima da cobertura.
4. No corte direto, o widget anterior fica congelado até o sinal nativo de
   prontidão. Na troca nativo→widget, preparar a WebView com alpha zero e
   apresentar somente após prontidão, evitando o plano preto Allwinner.
5. Ao terminar vídeo, cancelar watchdog/pre-end. Um frame final retido durante
   o handoff não é travamento. Rejeição de codec vale somente para o arquivo
   que falhou; não contaminar toda a playlist com decoder de software.
6. Eventos nativos atrasados precisam pertencer ao item atual antes de alterar
   visibilidade da WebView/cobertura. O fallback de 250 ms precisa pertencer à
   geração de mídia atual e continuar em `READY/isPlaying`.

## Erros identificados nesta revisão

- Imagens não eram encaminhadas nem ao `showImage` nativo nem a um componente
  de imagem no template. A Activity ignorava `visualReady` de imagem, levando
  ao watchdog de preparação de 20 segundos e à tela preta.
- Vídeo já encerrado permanecia com watchdog ativo na troca para imagem. O
  estado `ENDED` era tratado como falha, rejeitando AVC Allwinner e deixando
  vídeos seguintes no decoder de software; houve dezenas de frames perdidos.
- Template Android ainda passava `transitionEffect=fade` aos widgets, apesar
  do contrato de cobertura única. Corte direto removia o DOM anterior cedo.
- Teto do preset ultrawide/tall e cadência de vídeo podiam exceder o contrato
  compartilhado. Conversor ausente publicava o original sem normalização.

## Verificação

- `npm run build` e ESLint dos arquivos alterados.
- `npm run build:native-player && node scripts/test-native-renderer.mjs`: 11
  cenários, incluindo ausência de prontidão Web falsa para mídias nativas e
  retenção/liberação de loteria→vídeo em corte direto.
- `node scripts/test-media-compatibility.mjs`: executa ffmpeg/ffprobe reais;
  testa 4K60→Full HD30, codec/perfil, áudio, faststart, cadência fracionária,
  fonte menor, PNG e rejeição de arquivo inválido. Pode usar FFMPEG_PATH e
  FFPROBE_PATH no ambiente.
- Box Android 10 Allwinner, APK debug instalado sobre a versão anterior,
  mantendo vínculo e mídias. Comparar logcat e capturas pontuais reais; não
  usar espelhamento/gravação contínua como prova de fluidez do decoder.
- A playlist física contém relógio, clima, imagens e vídeos, incluindo trocas
  widget→widget, widget→vídeo, vídeo→imagem, imagem→vídeo, vídeo→vídeo e
  vídeo→widget. Renderer/codec tests não equivalem a ensaio físico Roku.
- A suíte Android completa tinha três falhas anteriores em regras de vínculo
  e expiração offline, fora dos arquivos de reprodução alterados. Não mudar
  essas regras para fazer o teste passar nesta intervenção.

Resultado do ensaio de 27/10: três ciclos completos com fade, 36 seleções com
prontidão confirmada, 22 inicializações AVC Allwinner, nenhum erro/recuperação e
dois frames descartados no período observado. Um ciclo adicional de corte
direto também completou sem erro/recuperação, com um frame descartado em vídeo
de 17,3 s. Capturas reais confirmaram vídeo e imagem em tela; os relatórios
não foram usados como única prova. Isso não substitui ensaio de 24–48 h nem
validação física em Roku.

O APK debug aceita `adb shell am start -n br.com.agencia360bh.totem/.MainActivity
--es mdi.debug.transition none` para testar corte seco no próximo item e
`--es mdi.debug.transition server` para voltar à configuração do Studio.
O override não é persistido e é desabilitado no release; não altera o servidor.

Implantar servidor por commit fixo e tag de imagem correspondente; distribuir
o APK separadamente com a mesma assinatura, sem desinstalar nem limpar dados.
