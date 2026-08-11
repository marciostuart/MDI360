# Operação e manutenção

## Rotina de publicação

1. Atualize e valide o código local.
2. Execute `npm run check` e `npm audit --omit=dev`.
3. Faça commit e push na `main`.
4. Construa `signage:<commit>` no Portainer.
5. Atualize a stack e valide logs e rotas.
6. Teste um terminal Web/Android e um Roku quando houver mudança de player.

## Aplicativos

- Android: build local pelo Android Studio ou workflow **Compilar APK Android**.
- Roku: `powershell -File scripts/build-roku.ps1`; o ZIP é gerado na raiz,
  ignorado pelo Git e publicado pelo workflow.
- Desktop: workflows produzem Windows, DEB e AppImage.

Os links mostrados aos clientes são exclusivamente os cadastrados em
**Torre > Downloads**. Compilar um aplicativo não altera automaticamente o link
configurado.

## Verificações periódicas

- Testar vínculo e persistência após reinício.
- Conferir atualização silenciosa de playlists.
- Conferir relatório de exibição por plataforma.
- Testar emissão normal/preferencial, chamada e impressão.
- Testar captura de tela nos dispositivos suportados.
- Usar **Torre > Fontes de dados** para validar loterias e notícias.
- Revisar dependências com `npm audit --omit=dev`.
- Repetir a análise de código órfão antes de grandes releases.

## Rollback

Altere a stack para a última tag por commit conhecida e atualize o serviço. Não
apague banco, bucket ou volumes. Migrações devem ser aditivas e compatíveis com
a versão imediatamente anterior.
