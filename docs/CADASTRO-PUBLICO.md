# Pré-cadastro público

## Implantação segura

1. Faça backup do PostgreSQL.
2. Confirme no ambiente da Stack `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` e `SIGNUP_DATA_SECRET` (gere 32 bytes aleatórios, por exemplo 64 caracteres hexadecimais). Mantenha o `SESSION_SECRET` existente inalterado. O pré-cadastro falha fechado se Turnstile ou a chave de cadastro estiverem indisponíveis.
3. Confirme que SMTP está habilitado e validado na Torre; sem envio de e-mail, o pré-cadastro não é aceito.
4. Atualize a imagem da Stack. O `docker/entrypoint.sh` executa `drizzle-kit migrate` antes de iniciar o servidor; isso aplica `0055_signup_requests.sql` automaticamente. A migração é aditiva e preserva `quiz_leads`.
5. Valide `/cadastro`, confirmação por e-mail e login em `/studio` antes de divulgar o link.
6. Em `/torre/site` > `Pré-cadastro`, configure o webhook HTTPS. O envio ocorre após a confirmação do e-mail; os últimos 100 cadastros confirmados ficam acessíveis somente à equipe da plataforma.

Os links antigos `/diagnostico` redirecionam para `/cadastro`. A tabela antiga de quiz não é removida para evitar perda de histórico, mas páginas, API e editor do quiz deixam de existir.

## Segurança e retenção

Os novos dados de pré-cadastro são cifrados com AES-256-GCM usando chave derivada de `SIGNUP_DATA_SECRET`. Guarde essa chave com segurança e mantenha-a estável, inclusive em backups e réplicas; mudá-la torna indisponíveis os dados cifrados com ela. Novos cadastros não dependem de `SESSION_SECRET`. A leitura de registros e a confirmação de links antigos usam a chave anterior somente para preservar dados existentes. O token é salvo apenas como hash, expira em 10 minutos, é de uso único e fica vinculado a hashes do IP e do User-Agent. Após confirmação, a organização é criada no plano gratuito e a sessão inicia no painel. O webhook é enviado com HTTPS, DNS fixado, bloqueio de IPs privados, sem redirects e chave de idempotência.

Defina uma política operacional de retenção/expurgo para pré-cadastros expirados não confirmados e para leads confirmados conforme a política de privacidade da empresa.
