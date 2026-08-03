# MDI360 Emissor (Windows)

Terminal de emissão de senhas em tela cheia que carrega `/emitir/<token>` do servidor e imprime cada senha na impressora térmica (EPSON TM-T20 e demais ESC/POS).

## Como usar
1. Abra `MDI360 Emissor.exe`.
2. O aplicativo mostra um código de vinculação de 6 caracteres.
3. No Studio, abra **Senhas**, localize a tela desejada e informe esse código em **Impressor Desktop**.
4. Selecione a impressora, ajuste margens/corte e clique em **Imprimir teste**.
5. Depois do vínculo, o aplicativo começa a imprimir automaticamente.

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

## Gerar o .exe
```bash
cd electron-emitter
npm install
npm run package:win
```
O resultado fica em `release/MDI360 Emissor-win32-x64/`.
