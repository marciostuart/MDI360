# Limpeza de arquivos na Torre

Em **Torre > Dados e suporte**, o botão **Limpar arquivos órfãos** faz primeiro uma varredura sem exclusões e pede confirmação antes de iniciar a limpeza. O filtro de estabelecimento limita a operação a essa empresa. Sem filtro, a operação inclui todas as empresas e os diretórios temporários de conversão reconhecidos no container atual.

A análise considera somente os prefixos `org/<uuid>/` e `branding/<uuid>/` do bucket configurado, objetos com pelo menos 24 horas e sem referências identificadas nos dados da aplicação. As referências e a idade são verificadas novamente na execução. Objetos alterados são protegidos por `If-Match`, desde que o provedor S3 compatível aplique essa condição. Não é possível detectar referências em sistemas externos ao banco. Não use a limpeza caso algum sistema externo dependa diretamente desses objetos sem registrá-los no MDI.

Os temporários locais são limitados aos diretórios de conversão reconhecidos, antigos e sem arquivos desconhecidos, dentro do diretório temporário do container atual. Não há varredura geral do VPS ou de outros containers. As tentativas são registradas na auditoria. A exclusão é permanente; revise o resultado da varredura e mantenha backups. A lista é reavaliada na execução e as quantidades podem mudar.
