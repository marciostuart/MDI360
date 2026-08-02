# MDI 360 — Análise Comparativa e Roadmap

> Documento de **planejamento**. Nenhuma alteração de código foi feita.
> Base de comparação: regras de negócio e features do modelo de referência (concorrente "Adeus Pendrive").
> Data: Agosto/2026 · Migrações atuais: `0000` → `0023`

---

## 1. Planos e Regras Comerciais

| Regra de negócio (referência) | Status MDI 360 | Onde está / O que falta |
|---|---|---|
| Plano Gratuito permanente (grandfathering p/ usuários antigos) | ✅ Temos | `0011_free_plan.sql` — plano restrito automático no cadastro. Falta política formal de grandfathering (travar features do plano antigo ao alterar o plano) |
| Plano Premium cobrado **por TV/mês** | ✅ Temos | `0013_billing_per_device.sql` — R$15/tela (referência usa R$10) |
| Plano Corporativo cobrado **por pacote de 50 TVs** | ❌ Falta | Hoje Corporativo é R$20/tela. Precisa modelo de *pacotes* (arredondar p/ cima em blocos de 50) |
| Trial de 10 dias em qualquer plano, autosserviço | ⚠️ Parcial | Existe ativação por 10 dias no motor de cobrança, mas não há botão "testar plano" no Studio nem trial p/ Corporativo |
| Trial estendido pelo suporte (manual) | ❌ Falta | Falta campo na Torre p/ estender trial por N dias |
| Cota de armazenamento por plano (10gb Premium / 50gb Corp) | ✅ Temos | Reserva atômica de storage + validação de cota |
| Aumento de cota sob demanda (suporte) | ✅ Temos | Editável na Torre (CRUD de planos/limites) |
| Página pública de Preços com matriz de features | ⚠️ Parcial | Landing existe; falta matriz "disponível / em breve" por plano |

## 2. Faturamento e Pagamentos

| Regra | Status | Observação |
|---|---|---|
| Cobrança **pós-uso**, fatura fecha no fim do mês, vence dia 05 | ⚠️ Parcial | Motor proporcional existe; falta fechamento de ciclo automático + vencimento fixo dia 05 |
| Cálculo **diário** por TV vinculada | ✅ Temos | Prorated billing por tela |
| Dia de vínculo e dia de desvínculo **não** são cobrados | ⚠️ Parcial | Hoje há proporcionalidade, mas a regra de "não cobrar o dia de vínculo/desvínculo" precisa ser explicitada no cálculo |
| Corporativo: proporcional por **upgrade/downgrade de pacote** | ❌ Falta | Depende do modelo de pacotes |
| Pagamento semestral (-7%) e anual (-20%) | ❌ Falta | Falta tabela de descontos + geração de fatura longa |
| Mercado Pago (PIX, cartão, boleto) | ❌ Falta | Já mapeado como próximo passo |
| PayPal | ❌ Falta | Fase 2 |
| Boleto/Lotérica só ≥ R$5 | ❌ Falta | Regra de valor mínimo por meio de pagamento |
| NFS-e automática (dados de faturamento + prazo de 10 dias) | ❌ Falta | Precisa cadastro fiscal + integração emissor |
| Histórico de faturas com download | ⚠️ Parcial | `studio/faturamento` existe; falta PDF/NFe por fatura |

## 3. Multi-tenant, Usuários e Permissões

| Feature | Status | Observação |
|---|---|---|
| Gerenciar múltiplas empresas na mesma conta | ⚠️ Parcial | Multi-tenant existe por organização, mas não há troca de empresas dentro de uma conta |
| Múltiplos usuários por conta | ⚠️ Parcial | Existe apenas para operadores de senha |
| Permissões granulares (ver / editar / não apagar / por empresa) | ❌ Falta | Precisa matriz de papéis + tabela `user_roles` dedicada |
| Impersonation (login in persona) | ✅ Temos | Torre de Controle |
| "Habilitar Edição" (modo leitura por padrão) | ❌ Falta | UX de segurança contra alteração acidental |

## 4. Conteúdos e Arquivos

| Feature | Status | Observação |
|---|---|---|
| Upload com progresso real + "Otimizando arquivo" | ✅ Temos | Biblioteca de mídia |
| Otimização automática (WebP / FullHD / bitrate) | ✅ Temos | FFmpeg + pipeline |
| **Otimização por TV** (uma versão por resolução/fps da tela) | ❌ Falta | Referência gera derivativos por dispositivo |
| Limite de fps/resolução configurável **por TV** | ⚠️ Parcial | `0023` guarda resolução; falta limite de fps/qualidade de vídeo |
| Suporte a 4K/60 (e 8K futuro) | ⚠️ Parcial | Hoje o alvo é FullHD/vertical |
| Substituir arquivo in-place | ✅ Temos | Biblioteca de mídia |
| Busca, filtros e tags | ✅ Temos | `0012_media_tags.sql` |
| Colunas customizáveis nas listagens | ❌ Falta | Baixa prioridade |
| Modo de preenchimento (Mostrar toda / Preencher na TV) | ❌ Falta | `object-fit` por item |
| Ponto focal da imagem (crop inteligente) | ❌ Falta | Depende do modo "Preencher" |
| Integração Canva para criar/substituir arte | ❌ Falta | Fase 3 |
| Limpeza de arquivos corrompidos no S3 | ✅ Temos | — |
| Uso do arquivo antes de terminar a otimização | ❌ Divergente | Nosso "Zero Buffer" só exibe após download concluído (decisão nossa, mais conservadora) |

## 5. Playlists e Agendamento

| Feature | Status | Observação |
|---|---|---|
| Montador drag-and-drop | ✅ Temos | — |
| Janela de exibição por arquivo (airing window) | ✅ Temos | `0009_media_air_window.sql` |
| Múltiplos agendamentos de **playlist na TV** | ⚠️ Parcial | `studio/agenda` existe; falta múltiplas regras concorrentes com prioridade |
| Regra: período de dias+horas | ✅ Temos | — |
| Regra: faixa de horas do dia (todos os dias) | ⚠️ Parcial | — |
| Regra: faixa de horas em dia da semana específico | ❌ Falta | — |
| Regra: dia da semana recorrente | ⚠️ Parcial | — |
| Regra: dia do mês recorrente | ❌ Falta | — |
| Regra: mês específico recorrente | ❌ Falta | — |
| Agendamento funciona **offline** no player | ⚠️ Parcial | Regras precisam ser resolvidas localmente no app |
| Música de fundo junto à playlist | ❌ Falta | Mixagem de áudio no player |
| Troca de playlist sem interromper exibição atual | ✅ Temos | — |

## 6. Widgets / Entretenimentos

| Feature | Status | Observação |
|---|---|---|
| Relógio, Clima (por CEP), Cotações, Notícias RSS | ✅ Temos | `studio/widgets` + proxy |
| Editor de layout drag-and-drop dos widgets | ✅ Temos | — |
| Fontes RSS externas customizadas + logo customizada | ⚠️ Parcial | RSS existe; falta branding do bloco de notícias |
| Entretenimentos extras: Hoje na História, Frases, Fotos, Horóscopo, Loteria, Top Músicas, Trailers, Receitas, Futebol, Cinema | ❌ Falta | Catálogo de entretenimentos |
| Documentação de consumo de rede por widget | ❌ Falta | Transparência (fácil e vendável) |
| Layout multi-zona (barra inferior + conteúdo principal) | ❌ Falta | Feature mais pedida na referência |

## 7. Player / Aplicativos

| Feature | Status | Observação |
|---|---|---|
| App Android (APK) com auto-boot e cache permanente | ✅ Temos | v1.1.0 |
| Canal Roku | ✅ Temos | — |
| Player Web (`/tela`) | ✅ Temos | — |
| App Windows (player) | ❌ Falta | Hoje só existe o **Impressor** Windows |
| Smart TVs (Tizen/WebOS) | ❌ Falta | Sob demanda |
| Auto-registro por código alfanumérico | ✅ Temos | `0002` |
| Exibição offline resiliente | ✅ Temos | Cache local |
| Proof of Play / Relatório de exibição | ✅ Temos | Com PDF |
| **Proof of Play offline** (grava e sincroniza depois) | ❌ Falta | Diferencial importante da referência |
| Captura de tela remota | ✅ Temos | `0023` |
| Limpeza remota de cache | ✅ Temos | `0023` |
| Reboot remoto | ✅ Temos | `0023` |
| Resolução customizada (telas verticais/atípicas) | ✅ Temos | `0023` |
| Substituir tela / Reset de códigos | ✅ Temos | Studio + Torre |
| Desvínculo apaga cache + reinicia app (com confirmação por código) | ⚠️ Parcial | Limpeza existe; falta confirmação digitando o código |
| Múltiplas saídas de vídeo no mesmo player | ❌ Falta | Fase 4 |

## 8. Monitoramento e Alertas

| Feature | Status | Observação |
|---|---|---|
| Status online/offline por TV | ✅ Temos | — |
| Métricas de tráfego por período (Torre) | ✅ Temos | — |
| Alerta por **e-mail** em caso de falha | ❌ Falta | Prioridade alta (está no Premium da referência) |
| Alerta por **WhatsApp** | ❌ Falta | Fase 3 |
| Aviso de que "offline ≠ parado" na UI | ❌ Falta | Texto de UX / ajuda |

## 9. White Label e API

| Feature | Status | Observação |
|---|---|---|
| Whitelabel dinâmico (logo, splash, cores) | ✅ Temos | `0003_org_branding.sql` |
| Textos do painel customizáveis | ⚠️ Parcial | — |
| Domínio próprio do cliente para o painel | ❌ Falta | Traefik + Cloudflare (wildcard + host dinâmico) |
| Gerar instalador do App com a marca do cliente | ❌ Falta | Build on-demand do APK |
| API pública com chaves | ❌ Falta | Fase 4 |
| IoT / gatilhos externos | ❌ Falta | Fase 5 |
| Integrações externas (Instagram, YouTube, Slides, Power BI, Agenda...) | ❌ Falta | Fase 4/5 |

## 10. Add-on exclusivo nosso (vantagem competitiva)

| Feature | Status |
|---|---|
| Chamada de senhas (painel, TTS, bitonal, tema, prioridade, guichês, totem PWA, impressor Windows) | ✅ **Temos — a referência não tem** |

---

## Resumo quantitativo

| Área | ✅ Temos | ⚠️ Parcial | ❌ Falta |
|---|---|---|---|
| Planos | 3 | 3 | 2 |
| Faturamento | 1 | 3 | 6 |
| Usuários/Permissões | 1 | 2 | 2 |
| Arquivos | 4 | 2 | 6 |
| Playlists/Agenda | 3 | 4 | 5 |
| Widgets | 2 | 1 | 3 |
| Player/Apps | 10 | 1 | 5 |
| Monitoramento | 2 | 0 | 3 |
| Whitelabel/API | 1 | 1 | 5 |

---

# Roadmap

Ordem pensada para **receita primeiro**, depois **retenção**, depois **escala**.

### Fase 1 — Monetizar (2–3 semanas)
1. **Mercado Pago**: PIX + cartão + boleto, com webhook em `/api/public/`.
2. **Fechamento de ciclo automático**: fatura fecha no último dia do mês, vence dia 05, cobrança pós-uso.
3. **Regra de dias**: não cobrar o dia de vínculo nem o dia de desvínculo (explícito no cálculo diário).
4. **Corporativo por pacote de 50 TVs** + proporcional em upgrade/downgrade.
5. **Semestral (-7%) e Anual (-20%)** com fatura única.
6. **Trial autosserviço de 10 dias** em qualquer plano + extensão manual pela Torre.
7. **Página de Preços** com matriz "Disponível / Em breve".

### Fase 2 — Retenção e confiança (2–3 semanas)
8. **Alerta por e-mail de TV offline** (com janela de tolerância configurável).
9. **Proof of Play offline**: player grava log local e sincroniza ao reconectar.
10. **Agendamento avançado**: horas por dia da semana, dia do mês, mês, múltiplas regras com prioridade — resolvidas **offline** no player.
11. **NFS-e**: dados de faturamento + emissão automática pós-pagamento (prazo de 10 dias).
12. **"Habilitar Edição"** (modo leitura por padrão) em telas, arquivos e playlists.
13. **Desvínculo com confirmação por código** + limpeza de cache garantida.

### Fase 3 — Times e conteúdo (3–4 semanas)
14. **Múltiplas empresas por conta** com seletor de contexto.
15. **Múltiplos usuários + permissões granulares** (tabela de papéis dedicada, por empresa).
16. **Modo de preenchimento + ponto focal** nas imagens.
17. **Derivativos por TV**: transcodificação por resolução/fps do dispositivo + limite de qualidade por TV.
18. **Música de fundo** na playlist.
19. **Alerta por WhatsApp**.

### Fase 4 — Escala e plataforma (4–6 semanas)
20. **Layout multi-zona** (barra inferior com relógio/clima + conteúdo principal).
21. **Catálogo de entretenimentos** (Hoje na História, Frases, Loteria, Futebol, Top Músicas, Trailers, Cinema) + tabela de consumo de rede.
22. **Domínio próprio do cliente** (Traefik wildcard + resolução por host).
23. **Build de APK whitelabel on-demand**.
24. **API pública** com chaves e escopos.
25. **Player Windows**.

### Fase 5 — Diferenciais avançados
26. Integrações externas (Instagram, YouTube, Google Slides, Power BI, Agenda, Vimeo).
27. IoT / gatilhos externos mudando conteúdo em tempo real.
28. Múltiplas saídas de vídeo por player.
29. Smart TVs (Tizen / WebOS).
30. Integração Canva.

---

## Decisões que sugiro manter diferentes da referência

- **Zero Buffer**: só exibimos após download concluído. A referência exibe durante a otimização. Nosso jeito evita travamento em aparelhos fracos — vale manter.
- **Preço**: hoje R$15 (Premium) e R$20 (Corporativo) por tela vs. R$10 e ~R$10 da referência. Se o objetivo é competir de frente, o pacote Corporativo de 50 TVs a R$500/mês é o argumento mais forte.
- **Add-on de Senhas**: é nosso diferencial real. Vale destacá-lo na página de Preços como módulo pago separado.