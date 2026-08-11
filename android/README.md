# Aplicativo Android híbrido MDI 360

Aplicativo único para Android 8 ou superior. Pode reproduzir mídia, emitir
senhas, chamar senhas e imprimir em USB ESC/POS, conforme as funções habilitadas
em **Studio > Terminais**.

## Compilar no Android Studio

1. Atualize a branch `main`.
2. Aguarde o Gradle Sync terminar.
3. Use **Build > Build APK(s)**.
4. Instale `app/build/outputs/apk/debug/app-debug.apk` no equipamento de teste.

O workflow **Compilar APK Android** também gera `mdi360-android.apk`.

## Provisionamento

1. Instale e abra o aplicativo.
2. Conceda as permissões solicitadas, inclusive USB e sobreposição quando o
   equipamento exigir inicialização automática.
3. Conecte a impressora e confirme a autorização USB.
4. Use o código exibido ou impresso em **Studio > Terminais**.
5. Habilite as funções desejadas e teste impressão, teclas, mídia e reinício.

`F10` abre a manutenção. O mapeamento aceita até dez teclas e cada tecla só
executa a função escolhida pelo usuário.

Não inclua APKs no Git. Cadastre o link público desejado em **Torre > Downloads**.
