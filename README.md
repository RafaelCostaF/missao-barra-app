# Missão Barra — app de monitoramento

MVP: GPS em eventos oficiais e corridas privadas entre amigos (mesmo fluxo de monitoramento), painel admin e logs em nuvem.
Especificação: `especificacao_app_missao_barra_v2.pdf`. Marca: `packages/ui-tokens` (extraído do brand kit).

## Estrutura
| Pasta | Conteúdo |
| --- | --- |
| `packages/core` | Regras compartilhadas: estado de sinal, distância, fila offline de posições, rastreador, logger, notificações, API (supabase-js), resumo/CSV. |
| `apps/mobile` | App Expo (SDK 58): login, eventos, corridas, amigos, tela única de percurso. GPS em 2º plano via `expo-location` + `expo-task-manager`. |
| `apps/admin` | Painel web (Vite + React + Leaflet): eventos, percurso/pontos de apoio, mapa ao vivo, alertas, resumo, logs com filtros e CSV. |
| `supabase/migrations` | Schema, RLS, regras de transição (triggers), `push_positions`, `raise_alert`, jobs de sinal perdido e retenção. |
| `supabase/functions/log-ingest` | Ingestão de logs em lote (validação em `rows.ts`). |
| `supabase/tests` | Testes de banco (SQL + RLS), ponta a ponta (supabase-js real) e carga. |
| `scripts/` | `test-db.sh` (stack local), `simulate.mts` (participantes simulados). |
| `docs/LOGS.md` | Como consultar/exportar logs. |

## Comandos
```bash
npm install
npm test              # núcleo (GPS simulado, fila offline, notificações…)
npm run test:db       # sobe Postgres + GoTrue + PostgREST (podman/docker) e roda testes de banco e e2e
npm run test:all      # tudo + typecheck de core, mobile e admin
npm run dev:admin     # painel (configure apps/admin/.env)
npm run dev:mobile    # app (configure apps/mobile/.env; GPS em 2º plano exige development build)
npm run simulate -- --session <uuid> --n 100   # carga num evento de TESTE ao vivo
```

### Ambiente local completo (Realtime + Edge Functions)
```bash
export DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock   # se usar podman
npx supabase start                    # portas 553xx (não colide com outros projetos)
chcon -Rt container_file_t supabase/functions   # Fedora/SELinux: libera a pasta para o edge runtime
eval "$(npx supabase status -o env | sed 's/^/export SUPABASE_/; s/SUPABASE_API_URL/SUPABASE_URL/')"
npm run demo                          # admin@missaobarra.test / missao-dada-2026 + evento de teste ao vivo
npm run simulate -- --session <id>    # participantes caminhando, perda de sinal e emergência
npm run test:realtime                 # notificações ao vivo e Edge Function real
npm run test:e2e -w @mb/admin         # painel no navegador (Playwright), salva screenshots em apps/admin/e2e/screenshots
```
Painel: `apps/admin/.env.local` com `VITE_SUPABASE_URL=http://127.0.0.1:55321` e a anon key.
App no emulador: `apps/mobile/.env` com `EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:55321`.

### Android
```bash
export JAVA_HOME=<JDK 17> ANDROID_HOME=~/Android/Sdk
cd apps/mobile && npx expo run:android         # development build (GPS em 2º plano não funciona no Expo Go)
GOOGLE_MAPS_API_KEY=… npx expo run:android     # com mapa; sem a chave o app mostra a lista de posições
```

## O que os testes cobrem
- **Cadastro/login** real no GoTrue; perfil e pseudônimo criados automaticamente; usuário não vira admin.
- **Evento oficial**: rascunho → publicado → ao vivo → encerrado; só rastreia ao vivo e após aceite; admin vê mapa e trilha.
- **GPS simulado**: percurso de 1 h com ruído, fixes imprecisos descartados, distância e próximo ponto de apoio.
- **Sem internet**: fila persistente, backoff, reenvio ao reconectar, logs da falha.
- **Emergência/ajuda**: chega ao painel com última posição; emergência só em evento oficial; sinal perdido > 10 min vira alerta.
- **Amizades e corrida privada**: só amigos aceitos são convidados; só o convidado aceita; sem compartilhar, some do mapa; criador encerra para todos e o GPS dos outros desliga sozinho.
- **Privacidade**: coordenadas só pela view filtrada; logs sem coordenadas/segredos; admin não vê corridas privadas.
- **Carga**: 200 participantes × 5 lotes.

## Deploy
```bash
supabase link --project-ref <ref> && supabase db push && supabase functions deploy log-ingest
```
Dois projetos Supabase (`test`, `prod`). Sessões de teste usam `is_test = true` e podem ser apagadas no painel.
Primeiro admin: `update profiles set role = 'admin' where id = '<uuid>';`
