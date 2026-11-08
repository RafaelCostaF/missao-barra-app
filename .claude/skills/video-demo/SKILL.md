---
name: video-demo
description: Cria o vídeo de demonstração (~60 s) do Missão Barra — organização no navegador e participantes no celular, com caminhada simulada, acompanhamento ao vivo, alertas, conversa de ajuda e perfil — e o texto de narração para o ElevenLabs. Use quando pedirem vídeo, demo, mockup em vídeo ou narração do produto.
---

# Vídeo de demonstração — Missão Barra

Objetivo: em ~60 s mostrar as **funcionalidades principais**, alternando os dois lados do produto:
- **Organização** → painel web no **navegador** (janela de desktop 1440×900 dentro de uma moldura de navegador).
- **Participante** → app no **celular** (moldura de iPhone, 390×844).

Foco em quem usa, sem detalhes técnicos. Cada cena = uma funcionalidade, uma frase de narração.

## Regras
1. **Roteiro aprovado antes de gravar.** Sempre comece pelo planejamento por segundo e por tópico (tabela abaixo) e espere o "ok" do usuário. Mudou o roteiro → nova aprovação.
2. **Pessoas fictícias, aparência real.** Nomes brasileiros realistas e fotos de rosto **geradas por IA ou de banco com licença de uso** (ex.: randomuser.me, Unsplash com licença). Nunca dados, nomes ou fotos de usuários reais do projeto. Contas `*@teste.dev`, evento `is_test`.
3. **Nada de dado sensível na tela:** sem e-mails reais, telefones reais (usar `+55 71 9xxxx` fictícios de teste), chaves ou URLs do Supabase. Na moldura do navegador, a barra de endereço mostra só "Painel Missão Barra" (sem URL real nem inventada).
4. **Limpar ao final:** apagar evento de teste e contas `*@teste.dev` (primeiro os alertas delas, depois `auth.users`). Contas `sim-*` do `simulate.mts` ficam.
5. Narração em pt-BR, tom acolhedor e direto, ~2,3 palavras/s (≈ 135–150 palavras em 60 s). Texto entregue pronto para colar no ElevenLabs.

## Formato do planejamento (entregar no chat para aprovação)
Tabela por segundo: `Tempo | Tópico | Tela (Navegador / Celular) | O que acontece | Narração | Legenda na tela`.
Depois da tabela: lista de participantes fictícios (nome, papel na história), e o texto corrido da narração.

## Execução (após aprovação)
1. **Pré-requisitos**
   - `ffmpeg`/`ffprobe` em `~/.local/bin`; Playwright Chromium (`apps/admin`).
   - Mapa no celular: o app na web usa `apps/mobile/web/maps-stub.js` (caixa cinza). Para o vídeo, trocar o stub por um mapa Leaflet real (mesma lib do painel; tiles Carto Voyager/OSM) que implemente `MapView` (ref: `animateCamera`, `setCamera`, `fitToCoordinates`, `getCamera`, `animateToRegion`; `showsUserLocation` via `navigator.geolocation` + `onUserLocationChange`), `Marker` (filhos via portal em `L.divIcon`, `showCallout`), `Polyline` (`strokeColor`, `strokeWidth`, `lineDashPattern`). Só web; o app no iPhone não muda.
   - Servidores: painel `npx vite --port 5179` (env `VITE_SUPABASE_*`) e app `npm run web` em `apps/mobile` na porta 8099 (env `EXPO_PUBLIC_SUPABASE_*`, sempre com caminho absoluto do `.env.cloud`; com `CI=1` reiniciar após editar).
2. **Dados** (script `tsx` com service role, nunca em produção real):
   - Participantes fictícios: criar contas `@teste.dev`, `display_name`, `profile_contacts` completo (telefone de teste, contato de emergência fictício), foto enviada ao bucket `avatars/<uid>/…` (baixar as fotos para o scratchpad; conferir licença).
   - Evento: criado **na tela** pela organização durante a gravação; percurso copiado de um evento modelo com `route` pelas ruas (ex.: "Missão barra - ensaio de campo 2").
   - Multidão andando: `npm run simulate -- --session <id> --n 15 --every 2 --stale 0.1 --emergency 0` com `SIM_SPEEDUP` alto; renomear os simulados para os nomes fictícios com foto, se aparecerem em destaque.
3. **Gravação** (Playwright, `recordVideo` 1920×1080): página "palco" local com a moldura do navegador (painel) e a do iPhone (app) lado a lado + faixa de legenda; ações por `frameLocator`. Um cronômetro de cena mantém cada ação dentro da janela do roteiro (aguarda o início da cena; ações que atrasarem são cortadas). Caminhada do participante no celular: `context.setGeolocation` a cada 1 s ao longo do percurso, ~3 m/s (pace realista). Salvar o instante t0 para o corte.
4. **Narração ElevenLabs**: gerar `narracao.txt` (texto corrido) e `cenas.json` (início de cada fala). Opção A: o usuário cola o texto no ElevenLabs e salva `narracao.mp3`. Opção B: API com a chave do usuário em variável de ambiente (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`; modelo `eleven_multilingual_v2`), uma fala por cena; nunca gravar a chave em arquivo do repo.
5. **Montagem (ffmpeg)**: cortar a partir de t0, 60 s, H.264 1080p 30 fps; cada fala posicionada no início da cena (`adelay` + `amix`), conferir com `ffprobe` que nenhuma fala passa da cena; vinheta inicial/final com logo (`packages/ui-tokens/icons/icon-512.png`) e lema "Missão dada é Missão Barra!". Saída em `~/Videos/missao-barra-demo.mp4` (ou onde o usuário pedir) — fora do repo.
6. **Revisão**: extrair 1 quadro por cena (`ffmpeg -ss … -frames:v 1`), olhar os quadros, corrigir e só então entregar. Limpar os dados (regra 4).

## Identidade
Cores e fontes de `packages/ui-tokens` (laranja `#C93C05`, carvão, areia; Archivo Black nos títulos, Inter no texto). Legendas curtas (≤ 6 palavras), caixa alta só em títulos.
