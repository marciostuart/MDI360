# MDI 360 Emissor (Windows)

App de mesa que abre o painel de emissão de senhas e imprime **direto** na
impressora térmica (testado com EPSON TM-T20), sem o diálogo de impressão do
navegador.

## Como o cliente usa

1. No painel (`/studio/senhas`), ative a emissão na tela desejada e copie o
   **código de vinculação** de 6 caracteres.
2. Abra o `MDI360-Emissor.exe`. Ele sempre inicia na tela de configuração.
3. Preencha o endereço do servidor + código, clique em **Vincular terminal**.
4. Escolha a impressora, ajuste margens/fontes/corte e clique em
   **Imprimir teste** até o cupom sair do jeito certo.
5. Clique em **Confirmar e abrir emissão em tela cheia**. Cada senha emitida é
   impressa na hora.
6. `F10` volta para as configurações · `Esc` sai do modo quiosque.

## Modo portátil (pendrive)

Crie um arquivo vazio chamado `portable.txt` na mesma pasta do `.exe`. A
configuração (`mdi360-emissor.json`) passa a ser gravada ali, então o terminal
roda de um pendrive sem instalar nada no computador.

## Compilar o executável

No Windows (ou em qualquer máquina com Node 20+):

```bash
cd electron-emitter
npm install
npm run build:win
```

O resultado fica em `electron-emitter/dist/MDI360-Emissor-win32-x64/`. Basta
zipar essa pasta e disponibilizá-la em **Studio → Downloads**. Para testar sem
empacotar: `npm start`.