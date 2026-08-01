# Como colocar o sistema no ar — SEM SSH, só pelo Portainer

Você não precisa de terminal nem de programar. É clicar, copiar e colar.
Faça um passo por vez.

O que já existe na sua VPS (e **não** vamos duplicar): `traefik_traefik`,
`postgres_postgres`, `minio_minio`, `redis_redis`.
Rede overlay compartilhada: **`360Network`**.

---

## Passo 1 — Criar o banco de dados (pelo Portainer)

1. Portainer → **Containers** → clique no container do **postgres**.
2. No topo, clique em **Console** → **Connect** (comando `/bin/sh`).
3. Cole a linha abaixo (troque `SENHA_FORTE` por uma senha sua) e dê Enter:

```
psql -U postgres -c "CREATE USER signage WITH PASSWORD 'SENHA_FORTE';" -c "CREATE DATABASE signage OWNER signage;"
```

Guarde a senha, ela entra no Passo 5.

> Se pedir usuário diferente de `postgres`, troque `-U postgres` pelo usuário do seu banco.

---

## Passo 2 — Criar o "cofre" das mídias no MinIO

1. Abra o painel do MinIO no navegador.
2. Crie um bucket chamado **signage-media**.
3. Deixe **privado** (é o padrão — não marque como público).
4. **Access Keys → Create access key** e guarde as duas chaves.

---

## Passo 3 — Gerar a senha secreta da aplicação

Sem terminal: abra https://generate-secret.vercel.app/32 (ou qualquer gerador de
string aleatória) e copie um valor longo (32+ caracteres). Ele será o `SESSION_SECRET`.

---

## Passo 4 — Construir a imagem no Portainer (substitui o SSH)

O Swarm não constrói imagem sozinho, mas o Portainer constrói:

1. Portainer → **Images** → **Build a new image**.
2. **Names**: use uma versão nova em cada build, por exemplo `signage:20260801-01`.
3. **Build method**: **URL** e cole a URL do repositório Git do projeto
   (ex.: `https://github.com/SEU_USUARIO/signage`), deixando
   **Dockerfile path** = `Dockerfile`.
   - Sem Git? Escolha **Upload** e envie um `.zip`/`.tar.gz` do projeto
     (o `Dockerfile` deve estar na raiz).
4. Clique em **Build the image** e aguarde terminar (alguns minutos).

> Para atualizar depois, use outra versão (`signage:20260801-02`, depois `-03` etc.).
> Não reutilize `latest`: o Swarm pode manter a imagem anterior em cache.

---

## Passo 5 — Subir a stack no Portainer (Swarm)

1. Portainer → **Stacks** → **Add stack** → nome: `signage`.
2. **Web editor** → cole o conteúdo do arquivo **`docker-stack.yml`** deste projeto.
3. Em **Environment variables** (botão *Advanced mode* permite colar tudo de uma vez):

| Nome | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://signage:SENHA_FORTE@postgres_postgres:5432/signage` |
| `S3_ENDPOINT` | URL **pública** do MinIO, ex.: `s3.360bh.com.br` ou `https://s3.360bh.com.br` (sem protocolo assumimos `https`). É ela que assina os links que o navegador e as TVs abrem |
| `S3_INTERNAL_ENDPOINT` | *(opcional)* URL interna, ex.: `http://minio:9000` — só use se o host interno **não** tiver `_` no nome |
| `S3_BUCKET` | `signage-media` |
| `S3_ACCESS_KEY_ID` | a access key do MinIO |
| `S3_SECRET_ACCESS_KEY` | a secret key do MinIO |
| `SESSION_SECRET` | o valor do Passo 3 |
| `APP_HOST` | `mdi.360bh.com.br` |
| `APP_URL` | `https://mdi.360bh.com.br` |
| `PLATFORM_ADMIN_EMAILS` | seu e-mail, ex.: `voce@360bh.com.br` |
| `STACK_NETWORK` | `360Network` |
| `SIGNAGE_IMAGE` | a tag criada no Passo 4, ex.: `signage:20260801-01` |

4. **Deploy the stack**. Nas próximas atualizações, altere `SIGNAGE_IMAGE` para
   a nova tag e clique em **Update the stack**; não atualize o serviço separado.

> Se o seu Traefik usar outro nome de entrypoint ou de certresolver (ex.: `https`
> em vez de `websecure`, `le` em vez de `letsencrypt`), ajuste essas duas linhas
> no editor antes de deployar. Para conferir: **Services → traefik_traefik →
> Environment/Command**.

---

## Passo 6 — Confirmar que funcionou

1. Abra `https://mdi.360bh.com.br`.
2. Clique em **Entrar no Studio** → aba **Criar conta**. O primeiro usuário vira o dono.
3. O painel do cliente fica em `/studio`; o seu painel interno em `/torre`
   (só abre para os e-mails de `PLATFORM_ADMIN_EMAILS`).
4. No painel, o bloco **Status da infraestrutura** deve mostrar "Conectado"
   para banco e armazenamento.

As tabelas do banco são criadas automaticamente no primeiro start — nenhum SQL manual.

---

## Passo 7 — Ligar a primeira TV

1. No aparelho da TV (TV Box, Fire Stick, Smart TV ou celular Android), abra o
   navegador em `https://mdi.360bh.com.br/tela` (ou o APK, quando pronto). A
   própria tela exibe um **código de ativação alfanumérico de 6 caracteres**.
2. No Studio: **Telas**, digite esse código, dê um nome à tela, escolha o formato
   (TV horizontal, totem vertical etc.) e clique em **Vincular tela**.
3. Em poucos segundos a TV sai da tela de código e começa a exibir. Ao remover a
   tela no Studio, o aparelho apaga o cache local, se desvincula e mostra um novo
   código — e o código antigo volta a ficar disponível.
4. Em **Conteúdos**, envie imagens/vídeos. Em **Playlists**, monte a sequência e
   **Publicar**. Em **Agenda**, defina dias e horários.
5. A TV sincroniza sozinha a cada 1 minuto. O botão **Atualizar** no card força a
   atualização na próxima checagem.

> Para virar APK depois, empacotamos essa mesma URL `/tela` num WebView
> (Capacitor) — sem mudar nada no servidor.

> O subdomínio do sistema está `noindex` e o `robots.txt` bloqueia buscadores,
> para não competir com a sua página orgânica. Nos botões "Entrar" da sua landing,
> aponte para `https://mdi.360bh.com.br/entrar`.

---

## Se algo der errado

Portainer → **Services → signage_signage → Logs** (ou Containers → Logs).
As mensagens começam com `[signage]`. Erros mais comuns:

- `No such image` → a tag em `SIGNAGE_IMAGE` não é a mesma criada no Passo 4.
- `ENOTFOUND` / `ECONNREFUSED` no banco → nome do serviço errado no
  `DATABASE_URL`, ou o postgres não está na rede `360Network`.
- `password authentication failed` → a senha do `DATABASE_URL` difere do Passo 1.
- Página não abre / erro de SSL → confira `APP_HOST`, o DNS na Cloudflare e o
  nome do entrypoint/certresolver do Traefik.
