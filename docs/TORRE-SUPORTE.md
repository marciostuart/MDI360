# Torre — dados e suporte global

## Escopo e permissões

`/torre/dados` é exclusivo dos e-mails definidos em `PLATFORM_ADMIN_EMAILS`.
Cada função de servidor verifica essa permissão, inclusive durante acesso como
cliente. Um administrador de empresa não recebe poderes de plataforma.

- Consulta paginada e busca entre empresas: usuários do Studio e seus perfis,
  terminais, mídias/widgets, filas, operadores/guichês, setores, emissores,
  unidades, playlists e seus itens, agendamentos, chamadas, senhas e exibições.
- Editar campos permitidos, ativar/desativar, redefinir senha de usuários e
  operadores e alterar perfis do Studio. Senhas e tokens nunca são devolvidos.
- Excluir individualmente usuários, dispositivos, mídias, filas e outros
  cadastros explicitamente habilitados. Exige ID completo e motivo.
- O último proprietário ativo e as contas da plataforma são protegidos.
- Detalhes da empresa mantêm a edição comercial e o acesso **Entrar como
  cliente** para os editores avançados existentes. Não há editor SQL genérico.
- Filas podem ser vinculadas novamente a um terminal da mesma empresa sem
  sobrescrever um vínculo existente. Seus arquivos exclusivos podem ser
  removidos individualmente pelo formulário de suporte.

## Causa dos logins aparentemente ocupados

Desde a migração 0030, excluir um terminal remove apenas o vínculo com a fila.
A fila e seus operadores podem continuar válidos no banco, mas a listagem do
Studio parte dos terminais e não os mostra. Os índices globais de usuário
continuam reservando seus logins. Isso não é uma FK quebrada.

Também havia gravações não transacionais na criação de fila/operador: uma
colisão no operador podia deixar uma fila parcial. Agora essas gravações são
atômicas, verificam ambos os cadastros e mantêm o login principal sincronizado.
A exclusão de um operador libera seu login principal quando aplicável, remove
IDs técnicos de chamadas/senhas e preserva os rótulos históricos.

As filas existentes sem terminal **não são apagadas automaticamente**. Na
Torre, filtre **Filas → Somente sem terminal**, busque o usuário e recupere o
vínculo ou exclua a fila conscientemente. A autenticação continua por login
global; não foi enfraquecida a unicidade entre empresas.

## Arquivos e exclusões

A migração aditiva 0053 cria `support_actions` e `storage_cleanup_jobs`, além
de gatilhos que retêm as chaves de arquivos excluídos/substituídos. Inclui o
tom da fila, os cinco slots de imagem, os fundos de widgets, logos e capturas
antigas. Excluir uma empresa inventaria os prefixos `org/<uuid>/` e
`branding/<uuid>/`, incluindo logos que antes sobreviviam à exclusão.

A limpeza verifica novamente referências em todas as empresas, layouts e
configurações de plataforma. Chaves fora da empresa de origem são protegidas,
tanto ao enfileirar quanto ao processar. Uma ação individual processa somente
os arquivos daquele registro; o reprocessamento em lote é uma ação explícita
separada, confirmada e auditada. Falhas no S3 mantêm os trabalhos pendentes.
Não há trabalho adicional no long polling ou na reprodução dos players.

O inventário global pagina 100 objetos por vez nos prefixos conhecidos `org/`
e `branding/`, inclusive de empresas já excluídas. Arquivo sem referência é
apenas um **candidato a órfão**, não um arquivo automaticamente descartável.
A remoção exige chave completa, motivo, proprietário reconhecido e mais de
24h desde a última modificação, conferida por HEAD no armazenamento. Uploads
em andamento, arquivos referenciados e históricos intencionais são preservados.
Não confundir esse prazo com a política offline do APK.

## Validação e publicação

- Testes de regras: `npm run test:billing`.
- Teste PostgreSQL isolado (PGlite instalado apenas em diretório temporário):
  `node --experimental-strip-types scripts/test-support-migration.mjs <diretorio-temporario>`.
  Verifica migração idempotente, rollback, cascatas, referências técnicas,
  captura de chaves de imagens/tons/logos/widgets e proteção entre empresas.
- UI local com RPCs fictícias: `node scripts/test-support-ui.mjs`, com servidor
  de build em `http://127.0.0.1:4186`. Não cria/exclui dados de clientes.
- Publicar a imagem do servidor pelo commit imutável. O entrypoint aplica a
  migração antes de iniciar. Não é necessário atualizar o APK.

Esta revisão audita código/migrações e fixtures isoladas; não é uma afirmação
de que o banco ou bucket de produção já foram inventariados ou limpos.
