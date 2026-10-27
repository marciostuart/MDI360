# Quiz comercial

- Página: `/diagnostico`, com entrada adicional na landing page.
- Gerenciamento: **Torre → Site → Quiz e capturas**. Edite introdução,
  autorização, perguntas, opções, campos do payload, destinos e encerramentos.
  Somente **Publicar quiz** altera o formulário público. Ciclos, perguntas
  desconectadas e destinos inexistentes impedem a publicação.
- As revisões publicadas ficam em `platform_settings` (`lead_quiz` e
  `lead_quiz:<revision>`). Visitantes que começaram uma revisão anterior podem
  concluir aquele percurso. Desabilitar o quiz bloqueia novas submissões.
- A migração aditiva `0052_quiz_leads.sql` cria o histórico no PostgreSQL,
  preservando as outras tabelas e a identidade dos terminais.
- Cada conclusão autorizada é validada pelo percurso **no servidor** e salva
  antes de iniciar, em paralelo, WhatsApp e webhook. O recibo não espera pelas
  APIs externas. Não se salvam formulários incompletos nem dados no navegador.
- WhatsApp: habilitar e informar o destinatário comercial com país + DDD.
  Reutiliza `EVOLUTION_API_URL`, `EVOLUTION_API_INSTANCE` e `EVOLUTION_API_KEY`
  existentes. A mensagem contém o resumo do lead, enviado à equipe comercial.
- Webhook: configurar URL HTTPS pública, porta 443. Recebe o objeto com nome,
  whatsapp, email, tipo_perfil, nicho_ou_atuacao, quantidade_telas_meta, crm_atual
  e quaisquer campos adicionais do editor. `Idempotency-Key` contém o UUID da
  captura; o CRM deve deduplicá-lo. O envio assíncrono usa HTTPS nativo com DNS
  fixado, timeout e bloqueio de redirecionamentos/rede privada contra SSRF.
- **Capturas recebidas** permite consultar respostas, autorização, payload,
  data, revisão e estados independentes dos disparos. Falhas não apagam leads.
  Atualizar e tentar envios pendentes/falhos recupera o trabalho, inclusive
  depois de um reinício. Enviados não são repetidos. Requisições interrompidas
  em `sending` podem ser recuperadas após 5 minutos. Não há reenvio automático
  de falhas: a operação fica explícita nessa aba.
- UUID evita duplicação por duplo clique/repetição da submissão; honeypot,
  tamanho máximo, verificação de origem e limite por contato/rede reduzem spam.
  O proxy deve sobrescrever `X-Forwarded-For`. Históricos e integrações são
  restritos ao administrador da plataforma. URLs privadas não vão ao cliente.
- Publicação: build/commit do servidor e nova imagem/Stack, com migração no
  boot já adotada pelo projeto. Não precisa alterar ou instalar o APK.
- Aceite pós-deploy: publicar configuração, concluir A e B com dados de teste,
  conferir duas linhas no histórico e os destinos reais de WhatsApp/CRM.
  Testes locais sem PostgreSQL/API não substituem esse aceite externo.
