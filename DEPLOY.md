# Como colocar o sistema no ar (passo a passo)

Você não precisa programar nada aqui. É copiar, colar e clicar.
Faça um passo por vez e não se preocupe com os outros.

---

## Passo 0 — Descobrir os nomes reais (Swarm)

Sua VPS roda **Docker Swarm** (as stacks aparecem como "Swarm" no Portainer), então
usamos o arquivo **`docker-stack.yml`** deste projeto — não o `docker-compose.yml`.

No terminal da VPS, rode e guarde as respostas:

```bash
docker network ls          # nome da rede do traefik (ex.: network_public)
docker service ls          # nomes dos servicos: postgres_postgres, minio_minio...
```

Dentro do Swarm, o "endereço" de um serviço é o **nome do serviço** que aparece em
`docker service ls`. Ex.: se aparecer `postgres_postgres`, o host do banco é
`postgres_postgres`. Nunca use `localhost`.

---

## Passo 1 — Criar o banco de dados no seu Postgres

Descubra o container do postgres e entre nele (troque `SENHA_FORTE` por uma senha sua):

```bash
PG=$(docker ps --format '{{.Names}}' | grep postgres | head -1)
docker exec -it $PG psql -U postgres -c "CREATE USER signage WITH PASSWORD 'SENHA_FORTE';"
docker exec -it $PG psql -U postgres -c "CREATE DATABASE signage OWNER signage;"
```

---

## Passo 2 — Criar o "cofre" das mídias no MinIO

1. Abra o painel do MinIO no navegador.
2. Crie um bucket chamado **signage-media**.
3. Deixe o bucket **privado** (é o padrão — não marque como público).
4. Vá em **Access Keys → Create access key** e guarde as duas chaves.

---

## Passo 3 — Gerar a senha secreta da aplicação

No terminal da VPS:

```bash
openssl rand -hex 32
```

Copie o resultado. Ele será o `SESSION_SECRET`.

---

## Passo 4 — Apontar o subdomínio na Cloudflare

O site comercial continua onde já está (`360bh.com.br`) e **não** é hospedado aqui.
Este subdomínio serve apenas o sistema (área logada).

1. Na Cloudflare, crie um registro **A** para `mdi` apontando para o IP da VPS
   (fica `mdi.360bh.com.br`).
2. Deixe a nuvenzinha **laranja** (proxy ativado).

> Definido: o sistema roda em **`mdi.360bh.com.br`**. O site comercial permanece
> em `360bh.com.br/pages/midia-digital-indoor`.

---

## Passo 5 — Construir a imagem na VPS

O Swarm **não constrói** imagem sozinho, então construímos uma vez na VPS:

```bash
cd /opt && git clone SEU_REPOSITORIO signage && cd signage
docker build -t signage:latest .
```

> Sem repositório Git? Envie a pasta do projeto por SFTP para `/opt/signage` e
> rode só o `docker build`.
> A cada nova versão: `git pull && docker build -t signage:latest .` e depois
> `docker service update --force signage_signage`.

---

## Passo 6 — Subir a stack no Portainer (Swarm)

1. Portainer → **Stacks** → **Add stack** → nome: `signage`.
2. **Web editor** → cole o conteúdo de **`docker-stack.yml`** (não o compose).
3. Na seção **Environment variables**, adicione:

| Nome | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://signage:SENHA_FORTE@postgres_postgres:5432/signage` |
| `S3_ENDPOINT` | `http://minio_minio:9000` |
| `S3_BUCKET` | `signage-media` |
| `S3_ACCESS_KEY_ID` | a access key do MinIO |
| `S3_SECRET_ACCESS_KEY` | a secret key do MinIO |
| `SESSION_SECRET` | o valor gerado no Passo 3 |
| `APP_HOST` | `mdi.360bh.com.br` |
| `APP_URL` | `https://mdi.360bh.com.br` |
| `PLATFORM_ADMIN_EMAILS` | seu e-mail, ex.: `voce@360bh.com.br` |
| `TRAEFIK_NETWORK` | nome da rede do traefik (Passo 0) |
| `DATA_NETWORK` | rede do postgres/minio (normalmente a mesma) |
| `SIGNAGE_IMAGE` | `signage:latest` |

4. Clique em **Deploy the stack**.

> Ajuste `postgres_postgres` e `minio_minio` para os nomes que apareceram no
> `docker service ls` do Passo 0. Se o postgres/minio estiverem em outra rede
> overlay, coloque o nome dela em `DATA_NETWORK`.
> Se o seu Traefik usa outro nome de entrypoint/certresolver (ex.: `https` em vez
> de `websecure`), ajuste essas duas labels no arquivo antes de deployar.

---

## Passo 7 — Confirmar que funcionou

1. Abra `https://mdi.360bh.com.br` (tela de acesso ao sistema).
2. Clique em **Entrar no Studio** → aba **Criar conta**. O primeiro usuário vira o dono.
3. Você cai no painel do cliente em `https://mdi.360bh.com.br/studio`.
   O seu painel interno fica em `https://mdi.360bh.com.br/torre` e só abre para os
   e-mails listados em `PLATFORM_ADMIN_EMAILS`.
4. No painel, o bloco **Status da infraestrutura** deve mostrar
   "Conectado" para o banco e para o armazenamento.

---

## Passo 8 — Ligar a primeira TV

1. No Studio, vá em **Telas → Nova tela**, escolha o formato (TV horizontal,
   totem vertical etc.) e cadastre. Um **código de 6 dígitos** aparece no card.
2. No aparelho da TV (TV Box, Fire Stick, Smart TV ou celular Android), abra o
   navegador em `https://mdi.360bh.com.br/tela`.
3. Digite o código. A tela fica pareada de forma permanente naquele aparelho
   (o código é de uso único e expira em 24 h).
4. Em **Conteúdos**, envie imagens/vídeos. Em **Playlists**, monte a sequência
   e clique em **Publicar**. Em **Agenda**, defina os dias e horários.
5. A TV sincroniza sozinha a cada 1 minuto. O botão **Atualizar** no card da
   tela força a atualização imediata na próxima checagem.

> Para transformar isso em APK depois, basta empacotar essa mesma URL `/tela`
> num WebView (Capacitor) — nenhuma mudança no servidor é necessária.

As tabelas do banco são criadas automaticamente no primeiro start —
você não precisa rodar nenhum SQL.

> O subdomínio do sistema está marcado como `noindex` e o `robots.txt` bloqueia
> buscadores, para não competir com a sua página que já performa no orgânico.
> Nos botões "Entrar" da sua landing atual, aponte o link para
> `https://mdi.360bh.com.br/entrar`.

---

## Se algo der errado

No Portainer, abra **Stacks → signage → signage_signage → Logs** (ou
`docker service logs -f signage_signage`). As mensagens começam com `[signage]`.
Os erros mais comuns:

- `ECONNREFUSED` / `ENOTFOUND` no banco → o `DATABASE_URL` aponta para um nome
  de serviço errado, ou a stack não está na mesma rede overlay do Postgres
  (ajuste `DATA_NETWORK`).
- `password authentication failed` → a senha no `DATABASE_URL` está diferente da do Passo 1.
- `No such image: signage:latest` → faltou o `docker build` do Passo 5.
- Página não abre → confira `APP_HOST`, `TRAEFIK_NETWORK` e se o entrypoint do seu
  Traefik se chama mesmo `websecure`.