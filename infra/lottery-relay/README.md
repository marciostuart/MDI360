# Relay privado das Loterias CAIXA

Transporte usado quando o endpoint oficial bloqueia o IP da VPS.

- Aceita apenas os caminhos oficiais fixados no código.
- Não aceita URLs arbitrárias.
- Exige o secret `RELAY_TOKEN`.
- Mantém cada resposta por quatro minutos no cache do Cloudflare.
- Não interpreta nem altera os resultados.

A URL e o token são administrados em **Torre de Controle > Fontes de dados**.
