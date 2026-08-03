# MDI360 Emissor (Windows e MiniOS/Linux)

Aplicativo único que abre o terminal de emissão em tela cheia e imprime cada senha na impressora térmica (EPSON TM-T20 e demais ESC/POS), sem depender de navegador aberto.

## Como usar
1. Abra `MDI360 Emissor.exe`.
2. O aplicativo mostra um código de vinculação de 6 caracteres.
3. No Studio, abra **Senhas**, localize a tela desejada e informe esse código em **Impressor Desktop**.
4. Selecione a impressora, ajuste margens/corte e clique em **Imprimir teste**.
5. Depois do vínculo, o aplicativo abre o emissor em tela cheia e começa a imprimir automaticamente.

O aplicativo inicia sozinho junto com a sessão gráfica. `F10` abre as configurações e `Ctrl+Shift+M` mostra o monitor de impressão.

Atalhos: `Ctrl+Shift+C` reabre a configuração · `F5` recarrega · `Ctrl+Shift+Q` encerra.

## Modo portátil (pendrive)
Crie um arquivo vazio `portable.txt` na mesma pasta do `.exe`. A configuração passa a ser gravada em `mdi360-emissor.json` ao lado do executável, sem instalar nada no computador.

## Ajustes da TM-T20
- Bobina 80 mm: largura de impressão `512` pontos. Bobina 58 mm: `384`.
- Margem esquerda em pontos (`8 pontos ≈ 1 mm`).
- Margens superior/inferior em linhas de avanço do papel.
- Guilhotina: corte parcial (padrão), total ou desligado; "Avanço até o corte" empurra o papel antes de cortar para não cortar o texto.
- "Exibir a posição na fila" vem desligado por padrão; ligue no cadastro se quiser imprimir "X pessoa(s) na frente".
- Rodapé aceita quebra de linha manual (Enter ou `|`) para evitar palavras cortadas.
- Margens superior/inferior aceitam valores negativos (avanço reverso) para economizar papel.
- Se a impressora estiver instalada com driver gráfico (Advanced Printer Driver) e não aceitar ESC/POS cru, troque o modo de impressão para **Driver do Windows**.

## MiniOS/Linux

O MiniOS é baseado em Debian. Instale o pacote `.deb` (recomendado) ou execute o `.AppImage` com persistência habilitada. Para impressão ESC/POS direta, o sistema precisa do CUPS e do comando `lp` (`cups-client`), e a impressora deve estar cadastrada no sistema.

## Gerar os instaladores
```bash
cd electron-emitter
npm ci
npm run dist:win
npm run dist:linux
```

O GitHub Actions gera automaticamente os artefatos Windows (`.exe`) e MiniOS/Linux (`.deb` e `.AppImage`) sempre que os arquivos do aplicativo mudam na branch `main`.
