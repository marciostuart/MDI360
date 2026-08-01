# App Android MDI 360 — como gerar o .apk (passo a passo)

Você **não precisa instalar nada** no seu computador. O GitHub compila o arquivo para você.

## Passo 1 — Abrir a esteira de compilação
1. Entre no repositório **MDI360** no GitHub.
2. Clique na aba **Actions** (no menu de cima).
3. Na lista da esquerda, clique em **Compilar APK Android**.

## Passo 2 — Mandar compilar
4. Clique no botão **Run workflow** (à direita) e confirme em **Run workflow**.
5. Espere de 3 a 6 minutos. Uma linha nova aparece na lista; quando ficar com um **✓ verde**, terminou.

## Passo 3 — Baixar o arquivo
6. Clique nessa linha verde.
7. Role até o fim, seção **Artifacts**, e clique em **mdi360-android-apk**.
8. Baixa um `.zip`. Abra e dentro está o **mdi360-android.apk**.

## Passo 4 — Publicar o APK no Studio (opcional, mas recomendado)
Para que seus clientes baixem direto em *Studio → Downloads*:
1. No GitHub, entre na pasta `public/`.
2. Clique em **Add file → Upload files** e envie o `mdi360-android.apk`.
3. Confirme (**Commit changes**) e refaça o deploy na VPS. O botão "Baixar APK Android" liga sozinho.

## Passo 5 — Instalar na TV / TV Box
1. No aparelho: **Configurações → Segurança → Fontes desconhecidas** (ativar).
2. Copie o `.apk` por pen drive, ou baixe pelo navegador da TV.
3. Abra o arquivo → **Instalar** → **Abrir**.
4. A TV mostra o **código de ativação**. No Studio: **Telas → Vincular tela**, digite o código.

## Detalhes úteis
- **Endereço do servidor**: já vem apontado para `https://mdi.360bh.com.br`. Se seu subdomínio for outro, edite a linha `DEFAULT_SERVER_URL` em `android/app/build.gradle` antes de compilar, ou, no aparelho, aperte a tecla **MENU** do controle para digitar o endereço.
- O app abre **sozinho quando a TV liga** e mantém a tela sempre acesa.
- O botão **voltar** está bloqueado, para ninguém sair do player sem querer.
- Sem internet, ele tenta reconectar a cada 15 segundos.
