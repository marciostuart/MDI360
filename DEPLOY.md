# Como colocar o sistema no ar (passo a passo)

Você não precisa programar nada aqui. É copiar, colar e clicar.
Faça um passo por vez e não se preocupe com os outros.

---

## Passo 1 — Criar o banco de dados no seu Postgres

Abra o terminal da VPS e rode (troque `SENHA_FORTE` por uma senha sua):

```bash
docker exec -it postgres psql -U postgres -c "CREATE USER signage WITH PASSWORD 'SENHA_FORTE';"
docker exec -it postgres psql -U postgres -c "CREATE DATABASE signage OWNER signage;"
```

> Se o container do seu Postgres tiver outro nome, troque `postgres` pelo nome certo.
> Para descobrir: `docker ps`.

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

## Passo 5 — Subir a stack no Portainer

1. Portainer → **Stacks** → **Add stack** → nome: `signage`.
2. Escolha **Repository** (se o código estiver no Git) ou **Web editor** e cole o
   conteúdo do arquivo `docker-compose.yml` deste projeto.
3. Na seção **Environment variables**, adicione:

| Nome | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://signage:SENHA_FORTE@postgres:5432/signage` |
| `S3_ENDPOINT` | `http://minio:9000` |
| `S3_BUCKET` | `signage-media` |
| `S3_ACCESS_KEY_ID` | a access key do MinIO |
| `S3_SECRET_ACCESS_KEY` | a secret key do MinIO |
| `SESSION_SECRET` | o valor gerado no Passo 3 |
| `APP_HOST` | `mdi.360bh.com.br` |
| `APP_URL` | `https://mdi.360bh.com.br` |
| `PLATFORM_ADMIN_EMAILS` | seu e-mail, ex.: `voce@360bh.com.br` |

4. Clique em **Deploy the stack**.

> Importante: dentro do Docker usamos o **nome do container** (`postgres`, `minio`),
> nunca `localhost`. Se os containers estiverem em redes diferentes, conecte o
> container `signage` às redes do Postgres e do MinIO no Portainer.

---

## Passo 6 — Confirmar que funcionou

1. Abra `https://mdi.360bh.com.br` (tela de acesso ao sistema).
2. Clique em **Entrar no Studio** → aba **Criar conta**. O primeiro usuário vira o dono.
3. Você cai no painel do cliente em `https://mdi.360bh.com.br/studio`.
   O seu painel interno fica em `https://mdi.360bh.com.br/torre` e só abre para os
   e-mails listados em `PLATFORM_ADMIN_EMAILS`.
4. No painel, o bloco **Status da infraestrutura** deve mostrar
   "Conectado" para o banco e para o armazenamento.

---

## Passo 7 — Ligar a primeira TV

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

No Portainer, abra **Containers → signage → Logs**. As mensagens começam com
`[signage]`. Os erros mais comuns:

- `ECONNREFUSED` no banco → o container `signage` não está na mesma rede do Postgres.
- `password authentication failed` → a senha no `DATABASE_URL` está diferente da do Passo 1.
- Página não abre → confira o `APP_HOST` e o nome da rede do Traefik no compose.