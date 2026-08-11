# Segurança

## Princípios

- Toda operação administrativa exige sessão e autorização por organização.
- Tokens de terminais são tratados como credenciais e não devem ir em URLs,
  logs ou respostas destinadas ao painel.
- Uploads são validados no servidor, convertidos quando aplicável e armazenados
  fora do código da aplicação.
- URLs externas são limitadas por listas internas e validação de protocolo.
- Exclusões devem remover referência no banco e objeto físico correspondente.

## Segredos

Use somente variáveis/segredos do Portainer e secrets dos provedores. Nunca
grave valores reais em `.env.example`, arquivos Markdown, commits ou pacotes
dos aplicativos.

O relay de loterias:

- exige `Authorization: Bearer`;
- aceita apenas endpoints oficiais previamente definidos;
- não funciona como proxy aberto;
- não registra o token;
- é configurado em **Torre > Fontes de dados**.

Novas versões do emissor desktop enviam o token pelo cabeçalho
`Authorization`. O servidor mantém temporariamente compatibilidade com
instalações antigas; remova essa exceção somente depois de atualizar todos os
emissores em produção.

## Verificação

Antes de cada publicação:

```sh
npm run check
npm audit --omit=dev
git diff --check
```

Também confirme que `git status` não contém `.env`, chaves, bancos, perfis de
navegador, APKs, instaladores ou pacotes gerados.

## Comunicação responsável

Falhas de segurança devem ser comunicadas diretamente à 360BH. Não publique
tokens, dados de clientes ou detalhes exploráveis em issues públicas.
