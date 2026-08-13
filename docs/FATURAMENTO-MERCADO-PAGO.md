# Faturamento pós-pago e Mercado Pago

## Regras comerciais

- Fechamentos permitidos: dias 01, 05, 10, 15 e 20, no horário de Brasília.
- A competência é `[fechamento anterior, fechamento atual)`.
- O vencimento termina às 23:59 do quinto dia após o fechamento.
- O valor e os itens ficam congelados na emissão.
- Mudança de fechamento vale somente no ciclo seguinte.
- Contas existentes começam sem faturamento automático; a Torre ativa cada uma individualmente.
- Planos por terminal preservam o cálculo proporcional. Planos fixos usam o preço mensal.

## Cobrança

O cliente paga o saldo aberto consolidado por Pix, cartão à vista ou boleto. Ao trocar o método,
a tentativa anterior é cancelada antes da próxima criação. Restrição única no banco, referência
externa e `X-Idempotency-Key` impedem duplicidades.

O cartão é tokenizado pelo MercadoPago.js e dados sensíveis nunca são persistidos. Pix e boleto
podem exigir o e-mail do pagador; boleto também exige documento e endereço. A confirmação 3DS é
aberta somente quando o banco exigir.

## Webhook e conciliação

Endpoint: `/api/public/mercado-pago/webhook`.

O servidor valida `x-signature`, `x-request-id` e timestamp. Depois consulta a Order diretamente
no Mercado Pago e confere referência, valor, moeda, ambiente, conta recebedora e faturas antes de
alterar o banco. Eventos repetidos ou fora de ordem são idempotentes. Uma rotina periódica consulta
tentativas pendentes como contingência.

Pagamentos aprovados quitam as faturas relacionadas e reativam a organização se não houver saldo
vencido. Pagamentos tardios já cobertos viram crédito. Reembolso ou contestação reabre o saldo.

## Avisos e suspensão

- No fechamento: banner e primeiro WhatsApp.
- No vencimento: segundo WhatsApp.
- Após o fim do vencimento: suspensão automática.
- O Studio suspenso mostra somente Faturamento e Sair.
- APIs operacionais ficam bloqueadas no servidor.
- Web, Android e Roku exibem mensagem neutra, sem informação financeira.

## Homologação obrigatória

Antes de ativar clientes reais, valide em uma organização interna:

1. Pix aprovado e expirado.
2. Cartão aprovado, recusado e 3DS.
3. Boleto gerado e conciliado.
4. Troca de método e clique duplicado.
5. Webhook repetido, fora de ordem e com assinatura inválida.
6. Valor, moeda, conta ou referência divergente sendo rejeitados.
7. Dois avisos de WhatsApp sem duplicidade.
8. Suspensão e reativação automáticas.
9. Reembolso, contestação e pagamento tardio.

Não habilite faturamento para toda a base antes do piloto.
