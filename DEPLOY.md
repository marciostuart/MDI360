# Publicação pelo Portainer

O ambiente de produção usa Docker Swarm, Traefik, PostgreSQL e armazenamento
compatível com S3. Migrações são aplicadas automaticamente antes do servidor
iniciar.

## Atualização segura

1. Confirme que a branch `main` está publicada e copie os sete primeiros
   caracteres do commit: `git rev-parse --short HEAD`.
2. No Portainer, abra **Images > Build a new image**.
3. Use o nome `signage:<commit>`, por exemplo `signage:0a23b80`.
4. Em **URL**, use
   `https://github.com/marciostuart/MDI360.git#<commit>`.
5. Mantenha **Dockerfile path** como `Dockerfile` e conclua o build.
6. Na stack `mdi360`, altere somente a imagem do serviço:

```yaml
services:
  signage:
    image: signage:<commit>
```

7. Clique em **Update the stack**. Para imagem local com tag imutável, não é
   necessário marcar **Re-pull image**.
8. Aguarde uma task ficar `running` e confira os logs:

```text
[signage] applying database migrations...
[signage] starting server on port 3000...
Listening on: http://localhost:3000/
```

9. Valide `/`, `/studio`, `/studio/terminais`, `/studio/senhas` e
   `/torre`. Preserve a imagem anterior para rollback imediato.

Nunca reutilize `latest` em produção. A tag pelo commit evita dúvida sobre a
versão em execução e reduz problemas de cache.

## Variáveis

As credenciais ficam somente nas variáveis/segredos da stack. Não as grave no
Git, em screenshots ou documentação.

- `DATABASE_URL`
- `S3_ENDPOINT`, `S3_INTERNAL_ENDPOINT`, `S3_BUCKET`
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `SESSION_SECRET`
- `APP_HOST`, `APP_URL`
- `PLATFORM_ADMIN_EMAILS`

Links de aplicativos e fontes externas são administrados pela Torre. O token do
relay da CAIXA deve permanecer secreto e nunca aparecer em APIs públicas.

## Diagnóstico

- `No such image`: a tag da stack não existe no mesmo nó do Swarm.
- Falha de migração: não force uma versão nova; restaure a imagem anterior e
  confira `DATABASE_URL`.
- Serviço reiniciando: abra **Services > mdi360_signage > Tasks** e veja a task
  rejeitada ou encerrada.
- Widget indisponível: use **Torre > Fontes de dados > Testar fonte**.

O primeiro provisionamento completo está documentado no histórico do projeto;
este arquivo descreve o fluxo atual de atualização sem perda de dados.
