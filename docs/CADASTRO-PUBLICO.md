# Pré-cadastro público

## Implantação segura

1. Faça backup do PostgreSQL.
2. Confirme no ambiente da Stack `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` e `SESSION_SECRET` (mínimo de 24 caracteres, igual à criptografia de credenciais existente; não troque uma chave em uso). O pré-cadastro falha fechado se Turnstile estiver indisponível.
3. Confirme que SMTP está habilitado e validado na Torre; sem envio de e-mail, o pré-cadastro não é aceito.
4. Atualize a imagem da Stack. O `docker/entrypoint.sh` executa `drizzle-kit migrate` antes de iniciar o servidor; isso aplica `0055_signup_requests.sql` automaticamente. A migração é aditiva e preserva `quiz_leads`.
5. Valide `/cadastro`, confirmação por e-mail e login em `/studio` antes de divulgar o link.
6. Em `/torre/site` > `Pré-cadastro`, configure o webhook HTTPS. O envio ocorre após a confirmação do e-mail; os últimos 100 cadastros confirmados ficam acessíveis somente à equipe da plataforma.

Os links antigos `/diagnostico` redirecionam para `/cadastro`. A tabela antiga de quiz não é removida para evitar perda de histórico, mas páginas, API e editor do quiz deixam de existir.

## Segurança e retenção

Os dados de pré-cadastro aguardando confirmação são cifrados com AES-256-GCM usando chave derivada do `SESSION_SECRET`. O token é salvo apenas como hash, expira em 10 minutos, é de uso único e fica vinculado a hashes do IP e do User-Agent. Após confirmação, a organização é criada no plano gratuito e a sessão inicia no painel. O webhook é enviado com HTTPS, DNS fixado, bloqueio de IPs privados, sem redirects e chave de idempotência.

Defina uma política operacional de retenção/expurgo para pré-cadastros expirados não confirmados e para leads confirmados conforme a política de privacidade da empresa.
