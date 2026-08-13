# Arquitetura do MDI 360

## Núcleo

A aplicação usa React, TanStack Start, Node.js, PostgreSQL/Drizzle e
armazenamento compatível com S3. Rotas em `src/routes` são geradas por arquivo;
`routeTree.gen.ts` é gerado automaticamente.

O servidor concentra autenticação, isolamento por organização, playlists,
agendamentos, filas, relatórios, sincronização e configuração da Torre. Players
recebem somente manifestos e comandos autorizados para o terminal vinculado.

## Terminais

O cadastro é centralizado em **Studio > Terminais**.

- Web e Roku operam como telas de mídia.
- Android é híbrido: mídia, emissor e chamador podem coexistir.
- Mídia permanece como camada principal; chamadas de senha usam a sobreposição
  configurada pelo cliente.
- Impressão e emissão não devem interromper a mídia.
- O vínculo usa um código de seis caracteres e persiste no dispositivo.

## Atendimento

Filas concentram numeração, operadores, terminais e personalização. A impressão
usa fila persistente e confirmação no dispositivo para reduzir perda ou
duplicidade. O Android mantém serviço de impressão independente da Activity.

## Widgets

Widgets são itens de playlist. Web e Android compartilham o renderizador React;
Roku possui renderização SceneGraph própria.

Resultados das Loterias CAIXA são consultados centralmente, validados,
normalizados e persistidos. Quando a origem oficial bloqueia o IP da VPS, um
Worker Cloudflare restrito transporta a resposta. Os players nunca consultam a
CAIXA diretamente e continuam usando o último resultado confirmado.

## Aplicativos

- `android/`: Kotlin, WebView restrita ao domínio do serviço, boot, impressão
  USB ESC/POS, teclas configuráveis e serviço persistente.
- `roku/`: BrightScript/SceneGraph, cache, widgets e relatório de exibição.
- `electron-emitter/`: Electron para Windows e Debian/MiniOS, CUPS ou ESC/POS.

Os binários são produtos de build e não pertencem ao histórico Git.
### Faturamento pós-pago

O extrato proporcional existente continua sendo a origem contábil. No fechamento, o servidor
congela o período e seus itens em `billing_invoices` e `billing_invoice_items`. Tentativas de
pagamento, rateios, notificações, créditos e auditoria ficam em tabelas próprias. O navegador
recebe somente a Public Key; criação, valor, conciliação e reconhecimento de pagamentos são
exclusivamente server-side.

O agendador fecha ciclos, gera avisos, suspende inadimplentes e reconcilia ordens. Locks
transacionais e chaves de idempotência impedem faturas ou cobranças duplicadas.
