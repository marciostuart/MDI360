# MDI360 Emissor Desktop

Aplicativo Electron para Windows e MiniOS/Linux. Abre o emissor em tela cheia,
mantém o equipamento acordado e imprime em impressoras térmicas.

## Uso

1. Instale e abra o aplicativo.
2. Selecione a impressora e o modo ESC/POS/CUPS ou driver.
3. Vincule o código em **Studio > Terminais**.
4. Faça uma impressão de teste e reinicie o computador.

`F10` abre a configuração. O vínculo e a impressora persistem entre
atualizações.

## Build

```sh
cd electron-emitter
npm ci
npm run dist:win
npm run dist:linux
```

Os workflows geram EXE, DEB e AppImage. Esses binários não devem ser
versionados; o link público é definido em **Torre > Downloads**.

No Linux, CUPS e `cups-client` são necessários. Preserve a fila configurada ao
atualizar o aplicativo.
