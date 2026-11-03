# Cobranças MDI 360 pela Central Pay 360BH

As novas cobranças pós-pagas do MDI são criadas pela API proprietária Pay 360BH (`POST /api/v1/cobrancas`). O MDI envia valores em centavos, CPF/CNPJ e uma referência única por tentativa. A criação exige perfil financeiro completo e respeita o mínimo de R$ 5,00 definido pela API.

## Configuração

1. Aplicar a migração `0054_pay360bh_billing.sql` antes de iniciar a versão nova.
2. Na Torre, abrir **Pagamentos** e preencher código do projeto, chave de serviço e token de notificação fornecidos pela Central. Os segredos são criptografados no armazenamento de configurações.
3. Copiar a URL de webhook exibida na Torre e cadastrá-la no projeto da Central Pay 360BH, com o mesmo código de projeto e token.
4. Confirmar que a configuração aparece como pronta. Sem configuração, o MDI não emite cobranças novas.

O webhook exige HTTPS e o header `X-Notificacao-Token`. O receptor confere o projeto e a referência, persiste `evento_id` com unicidade e processa `RECEIVED` em transação. Notificações repetidas são idempotentes. A confirmação não contém valor; o MDI correlaciona a cobrança com a tentativa e valida as alocações locais às faturas antes de dar baixa.

## Limitações e segurança operacional

- A versão documentada da API oferece somente Pix, mínimo de R$ 5,00. Cartão e boleto não são oferecidos para novas cobranças.
- A API não oferece consulta por referência nem cancelamento. Uma falha/timeout ambíguo mantém a tentativa reservada, evitando gerar outra cobrança Pix duplicada. Antes de tentar novamente, a equipe deve verificar a cobrança na Central; o conflito HTTP 409 não devolve o Pix existente.
- Um Pix pendente não pode ser cancelado pela baixa manual do Studio/Torre e continua pagável até expirar. Se recebido depois da baixa, o valor vira crédito da empresa.
- Ações irreversíveis de estorno não são sincronizadas pelo webhook documentado. Não considerar estorno concluído apenas pelo MDI.
- Tentativas históricas do Mercado Pago permanecem identificadas pelo provedor original e seguem seus mecanismos existentes de reconciliação/webhook. A tela de pagamentos da Torre não oferece mais configuração ou criação de cobranças por esse provedor. Essa compatibilidade histórica não é usada para novas cobranças.
- Esta alteração não realiza deploy nem cobrança de teste. A homologação deve usar uma conta/projeto apropriado da Central e confirmar geração e recebimento do webhook antes da liberação operacional.
