---
name: video-demo
description: Cria o vídeo de demonstração (~55 s) do Missão Barra — organização no navegador e participante no celular, caminhada simulada, acompanhamento ao vivo, avanço por ponto, ajuda/chat, emergência e perfil — horizontal e vertical, com narração ElevenLabs. Use quando pedirem vídeo, demo, mockup em vídeo ou narração do produto.
---

# Vídeo de demonstração — Missão Barra

**Estado (2026-11):** vídeo final aprovado e entregue em `~/Downloads/missao-barra-demo{,-vertical}{,-web-av1,-web-h264}.mp4`; narração `~/Downloads/narracao-missao-barra.mp3` (51,9 s, ElevenLabs v3). Só refazer se o usuário pedir.

## Regras
1. **Roteiro por segundo aprovado antes de gravar** (tabela `Tempo | Cena | Tela | Ação | Narração | Legenda`). Mudou → nova aprovação.
2. **Pessoas fictícias**: nomes brasileiros, rostos gerados por IA (`https://thispersondoesnotexist.com/random-person.jpeg?<n>` com User-Agent de navegador; o gerador tem viés para pele clara — baixar várias levas e escolher diversidade; nada de crianças). Nunca dados/fotos de usuários reais. Contas `video-*@teste.dev`, evento `is_test`.
3. Nada sensível na tela (e-mails/telefones reais, chaves, URLs do Supabase). Barra do navegador mostra só "Painel Missão Barra".
4. Saídas em `~/Downloads` (preferência do usuário). Limpar no fim: `cleanup.mts --all`.
5. Respostas curtas; se o usuário disser "pare", entregue o que existe.

## Roteiro aprovado (tempos = falas da narração, via Whisper)
intro 6,1 · create 5,8 · join 4,8 · runner 5,9 · live 5,3 · funnel 5,7 · help 5,6 · reply 4,8 · profile 4,4 · outro 7,1 (total 55,5 s).
Títulos (topo): Organização·navegador/"Crie o evento em minutos" · Participante·celular/"Entrar é um toque" · Modo corrida/"O caminho sempre à frente" · Acompanhamento ao vivo/"Todo mundo no mapa" · Pontos de apoio/"Quem passou e quem falta" · Ajuda/"Conversa direta com a equipe" · Resposta na hora/"Emergência: é só segurar" · Perfil/"Foto e contato de emergência". Vinhetas: "40 km a pé · Salvador / MISSÃO BARRA / Segurança do início ao fim" e "Missão dada é Missão Barra!" + 3 etiquetas.
Elenco: Juliana Ramos (protagonista, celular) + 15 caminhantes (Carla Menezes fica "sem sinal"). Percurso: orla Farol da Barra → Buraquinho, 13 pontos, 40,1 km.

## Pipeline (scripts em `scripts/`, rodar da raiz do repo com `set -a; source supabase/.env.cloud; set +a`)
`DIR` = pasta de trabalho (scratchpad). Precisa de `DIR/timeline.json` (`[{id,d}]`), `DIR/subtitles.json` (`[[início_s,"texto"],…,[fim,""]]`), `DIR/logo.png` (de `packages/ui-tokens/icons/icon-512.png`), `DIR/cast/NN.jpg` (rostos; o setup baixa do Storage se faltar).
1. Servidores: painel `cd apps/admin && VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npx vite --port 5179 --strictPort --host 127.0.0.1`; app `cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… CI=1 npx expo start --web --port 8099` (com CI=1 não recarrega arquivos: reiniciar após editar); palco `python3 -m http.server 8098 --bind 127.0.0.1 -d $DIR` (precisa ser http/localhost, não file://).
2. `npx tsx .claude/skills/video-demo/scripts/setup.mts $DIR` — percurso pelas ruas + elenco (idempotente) → `state.json`.
3. `cleanup.mts` (apaga eventos do vídeo) e `record.mts $DIR` (horizontal → `DIR/h`) / `VERTICAL=1 record.mts $DIR` (→ `DIR/v`). Cria o evento na tela, entra Juliana, caminhantes com histórico de posições (o relatório usa posições a ≤150 m de cada ponto). Falhas viram `falha-<cena>.png`.
4. `[VERTICAL=1] compose.mts $DIR <narracao.mp3> ~/Downloads` (~7 min cada): interpolação mci 30 fps por cena em paralelo, acelera cena que passou da fala, legenda + barra de progresso como camadas, mestre H.264 CRF 15, versões ≤14,5 MB (AV1 svt crf 30 `scm=1`, H.264 2-pass ~1,9 Mbps), quadros em `review/`. **Olhar os quadros antes de entregar.**
5. `cleanup.mts --all`.

## Armadilhas já resolvidas (não repetir)
- Artifact: limite 15 MB/arquivo → H.264 fica borrado; publicar `<video>` com `<source>` AV1 primeiro e H.264 de reserva.
- Captura via CDP screencast (~25 fps): `blur`/`filter` no palco derruba fps; ack antes de gravar o quadro.
- Foco em input dentro de iframe rola o palco: `overflow: clip` + listener de scroll.
- Histórico é compartilhado entre os iframes: `history.back()` ou o "voltar" do app fecha a conversa no painel → reabrir o painel por URL antes da cena seguinte; voltar no app tocando a seta (posição ao lado do título).
- `frame.reload()` não existe: `frame.evaluate(() => location.reload())`.
- Leaflet `flyTo` com origem = destino gera NaN → usar `setView` animado. Tiles Carto exigem chave → OSM.
- Na web: sem notificação local (`useNotices`) e sem localização em 2º plano (`location.ts`); o mapa é Leaflet (`apps/mobile/web/maps-stub.js`, só no bundle web).
- Botões do painel: "Publicar evento →"/"Iniciar evento →" (usar regex); abas são links (`nav.tabs`).
- Lista de eventos antigos de teste: esconder linhas no DOM durante a gravação (não apagar).
- Contas reais (ex.: alerta aberto do Rafael) aparecem no AlertCenter do painel: não abrir o modal de alertas no vídeo; usar a aba Atendimentos do evento.
