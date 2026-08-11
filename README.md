# MDI 360

Plataforma multiempresa de sinalização digital e gestão de atendimento. O mesmo
servidor atende players Web, Android híbrido e Roku, além dos emissores desktop
para Windows e MiniOS/Linux.

## Recursos principais

- Terminais vinculados por código único, com mídia, emissão e chamada de senhas.
- Conteúdos, playlists, agenda, widgets e atualização em segundo plano.
- Filas, operadores, impressão ESC/POS e chamadas personalizadas.
- Relatórios de exibição, monitoramento e captura de tela quando suportada.
- Widget de Loterias CAIXA com cache persistente e última informação válida.
- Torre de Controle para clientes, planos, site, downloads e fontes de dados.

## Estrutura

| Pasta                  | Responsabilidade                                            |
| ---------------------- | ----------------------------------------------------------- |
| `src/`                 | Aplicação web, APIs, regras de negócio e player Web/Android |
| `drizzle/`             | Migrações PostgreSQL aplicadas na inicialização             |
| `android/`             | Aplicativo Android híbrido                                  |
| `roku/`                | Canal Roku nativo em BrightScript/SceneGraph                |
| `electron-emitter/`    | Emissor desktop Windows e MiniOS/Linux                      |
| `infra/lottery-relay/` | Relay restrito para a fonte oficial da CAIXA                |
| `scripts/`             | Empacotamento e validações auxiliares                       |

Detalhes técnicos estão em [Arquitetura](docs/ARQUITETURA.md), procedimentos em
[Operação](docs/OPERACAO.md) e controles em [Segurança](SECURITY.md).

## Desenvolvimento

Requisitos: Node.js 22 e Bun 1.3.3.

```sh
bun install --frozen-lockfile
bun run dev
```

Validação antes de publicar:

```sh
npm run check
npm audit --omit=dev
```

O build de produção é gerado pelo `Dockerfile` e inicia na porta 3000. Consulte
[DEPLOY.md](DEPLOY.md) para publicar uma imagem identificada pelo commit.

## Autoria

- Márcio Stuart
- 360BH
- https://360bh.com.br
- (31) 92005-1113
