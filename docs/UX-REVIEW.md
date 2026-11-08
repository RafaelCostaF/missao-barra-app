# Review de UI/UX — Missão Barra (08/11/2026)

Base: navegação real no painel publicado (computador 1400 px e celular 390 px, evento "ensaio de campo") e leitura das telas do app.
Prioridade: **P0** = risco operacional ou bloqueio (fazer já) · **P1** = atrito frequente · **P2** = refinamento.

Princípios usados: a ação mais comum é a mais visível; ação destrutiva nunca é o botão principal; todo número leva à lista que o explica; em campo (sol, pressa, uma mão) o essencial cabe sem rolar.

---

## Organização (painel web e aba Organização do app)

### P0
| # | Problema observado | Proposta |
|---|---|---|
| A1 | **Logs duplicados** (cada registro aparecia 3–5×) — corrida no buffer do logger. | ✅ Corrigido nesta revisão (fila nas gravações + teste). |
| A2 | **No celular, o cabeçalho corta o indicador de alertas e o botão Sair** (390 px). O organizador em campo não vê emergências. | Cabeçalho móvel: logo + indicador de alertas sempre visível; navegação num menu (☰) ou barra inferior. |
| A3 | **"Encerrar evento" é o botão laranja principal**, no topo de todas as abas (no celular ocupa a largura toda). Um toque errado encerra o rastreio de todos. | Mover ações do ciclo de vida para um menu "Evento ▾"; Encerrar em vermelho/contorno, com confirmação digitando o nome do evento. Laranja só para o próximo passo positivo (Publicar, Iniciar). |
| A4 | **Percurso editável com o evento ao vivo**, sem aviso; trocar de aba descarta mudanças sem perguntar. | Ao vivo: aviso "mudar o percurso altera km/estimativas de todos"; indicador "alterações não salvas" + confirmação ao sair. |
| A5 | **Erros e confirmações usam caixas nativas do navegador** (`alert`/`confirm`) — bloqueiam a tela, não seguem a marca, somem sem rastro. | Toasts (sucesso/erro) e modal de confirmação próprio, com o texto da consequência. |

### P1
| # | Problema | Proposta |
|---|---|---|
| A6 | **Eventos**: formulário de criação domina a página; lista cheia de testes arquivados; o evento ao vivo fica por último; só o link "Abrir" é clicável. | Botão "Novo evento" (modal). Abas Ativos · Arquivados · Testes. Ao vivo primeiro, com selo pulsante. Linha inteira clicável. Colunas: inscritos, em percurso, alertas abertos. |
| A7 | **Datas em formato americano** (`mm/dd/yyyy, PM`) nos campos de data (criação de evento, logs). | Campo DD/MM/AAAA HH:MM com máscara (já existe no core: `maskDateTimeBR`) ou atalhos "Hoje / Amanhã 05:00". |
| A8 | **Alertas sem ação direta**: para ligar é preciso abrir o perfil. | Em cada alerta (aba e central do cabeçalho): Ligar · WhatsApp · Ver no mapa · Resolvido. Mostrar "há X min" em vez de hora. |
| A9 | **Mapa sem legenda** (verde/amarelo/preto/anel vermelho não explicados). | Legenda compacta no canto + contagem por cor. |
| A10 | **Filtros de Participantes confusos**: 11 chips em 2 linhas; "Concluiu", "Finalizou" e "Não concluiu" parecem iguais. | Dois grupos: **Agora** (Monitorando, Sem sinal, Chamado aberto, Fora do percurso, Retardatário, Bateria baixa) e **Resultado** (Não iniciou, Concluiu o percurso, Parou antes da chegada). Esconder chips com 0 fora de "Todos". |
| A11 | **Estados vazios pouco úteis**: "Sem posições ativas" com 13 pessoas finalizadas; "0 min" de tempo mediano em dados incompletos. | Explicar o porquê e o próximo passo ("13 já finalizaram — ver Relatório"). Mostrar "—" quando não há dado suficiente. |
| A12 | **Logs técnicos ilegíveis**: JSON cru, sem cor por nível. | Nível colorido, filtros rápidos (1 h, 24 h, 7 dias; só erros), detalhes expansíveis, agrupar repetidos ("×3"). |
| A13 | **Pessoas no celular**: os filtros ocupam a tela inteira antes da lista. | "Filtros (2)" recolhível; busca sempre visível. |
| A14 | **Equipe**: exige digitar o e-mail exato. | Busca por nome com sugestões (mesma lista de Pessoas). |
| A15 | **Linhas de tabela clicáveis não acessíveis por teclado** (só mouse). | Linhas como links/botões com foco visível; `Esc` fecha modais; `/` foca a busca. |

### P2
- Busca global no cabeçalho ("achar pessoa") que abre o perfil no evento ao vivo.
- Agrupar marcadores no mapa com 300+ pessoas; modo noturno para operação de madrugada (largada cedo).
- Relatório em PDF para a organização; comparação entre edições.
- Reduzir setas "→" em todos os botões (hoje estão em quase todos e perdem o sentido de "próximo passo").

---

## Participantes (app)

### P0
| # | Problema | Proposta |
|---|---|---|
| U1 | **Emergência/Ajuda/Finalizar ficam no fim da tela**, abaixo do mapa e de todo o painel de métricas — em uma emergência a pessoa precisa rolar. | Barra fixa no rodapé da tela do percurso: **Emergência** (vermelho, segurar 1 s), Ajuda, Finalizar. |
| U2 | **Sem "Esqueci minha senha"** no login — quem esquece fica sem acesso no dia do evento. | Link "Esqueci minha senha" (e-mail do Supabase Auth, gratuito). |
| U3 | **Ordem da tela do percurso**: mapa grande primeiro, pace depois. Correndo, o que importa é pace, distância e próximo ponto. | Métricas no topo; mapa recolhível ("Ver mapa"). Fonte maior e alto contraste para sol. |

### P1
| # | Problema | Proposta |
|---|---|---|
| U4 | Sem avisos durante a corrida (relógios avisam a cada km). | Aviso por voz/vibração a cada km: "Km 5, pace 6:02, faltam 3 km para o Jardim de Alah" (expo-speech funciona no Expo Go). Liga/desliga. |
| U5 | Sem histórico das próprias corridas. | "Minhas corridas" no Perfil: data, distância, tempo, pace, parciais. |
| U6 | Amigos: busca só ao tocar em Buscar; sem convite para quem não tem o app. | Busca enquanto digita; "Convidar pelo WhatsApp" com link do app. |
| U7 | Permissão de notificações pedida logo após o login, sem contexto. | Pedir ao entrar no primeiro evento/corrida, explicando o porquê. |
| U8 | Cartão do evento só com nome e data. | Contagem regressiva, local da largada ("Como chegar"), distância total e pontos de apoio. |
| U9 | Cadastro sem noção de progresso. | Barra "Cadastro 2/3" com o que falta. |
| U10 | Sem aviso claro de "sem internet" fora da tela do percurso. | Faixa global "Sem internet — suas posições serão enviadas depois". |

### P2
- Tela de bloqueio (Live Activity) e relógio exigem build pago da Apple — fora enquanto o app roda no Expo Go.
- Tema escuro para largada de madrugada.

### Ponto de atenção (escopo)
A especificação lista **ranking** como fora do escopo. A tela do percurso hoje mostra a posição ("12º de 40") e a distância para quem está à frente. Se a organização quiser evitar clima de competição, trocar por "X pessoas à sua frente no trecho" ou esconder.

---

## Ordem sugerida
1. **P0 do participante** (U1–U3) e **P0 do painel** (A2–A5): segurança e operação no dia do evento.
2. **P1 do painel** (A6–A11): agilidade da organização ao vivo.
3. **P1 do participante** (U4–U10): experiência de quem corre.
4. P2 conforme o retorno do teste de campo.
