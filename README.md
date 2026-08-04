# MDI 360

Plataforma para sinalização digital, gestão de telas, playlists, conteúdos e atendimento por senhas.

## Autoria

- Márcio Stuart
- 360BH
- https://360bh.com.br
- (31) 92005-1113

## Desenvolvimento local

Requisitos: Node.js 22 e Bun 1.3.3.

```sh
bun install --frozen-lockfile
bun run dev
```

## Build de produção

```sh
bun run build
```

O contêiner de produção é gerado pelo `Dockerfile` e inicia o servidor na porta 3000.
