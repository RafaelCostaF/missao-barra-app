# Missão Barra — agent context

GPS monitoring app (official events + private friend races, same tracking flow), admin panel, cloud logs. Spec: `~/Downloads/especificacao_app_missao_barra_v2.pdf`. Brand: `packages/ui-tokens` (from `missao-barra-brand-kit.zip`). UI text pt-BR. Repo: github.com/RafaelCostaF/missao-barra-app (main).

## Layout (npm workspaces)
- `packages/core` — all logic, framework-free, injected deps: `signal.ts` (stale >2min), `geo.ts` (haversine, accuracy filter, `toFix`), `queue.ts` (persistent offline position queue, backoff), `tracking.ts` (tracker: consent→tracking→finished; auto-stops GPS on server "not tracking"), `logger.ts` (sanitizes secrets/coords, offline buffer → log-ingest), `notifications.ts` (`toNotice`), `api.ts` (supabase-js data layer), `report.ts` (summary, CSV, `SESSION_ACTIONS`).
- `apps/mobile` — Expo SDK 58, expo-router (`src/app`), `src/lib/{services,location,bootstrap}.ts`. Single session screen `src/app/session/[id].tsx` for both kinds. Expo Go has no background GPS → `location.ts` falls back to `watchPositionAsync` + keep-awake. Android without `GOOGLE_MAPS_API_KEY` shows list instead of map (`LiveMap.tsx`).
- `apps/admin` — Vite + React + Leaflet, hash routes: events CRUD/lifecycle, route editor, live map/alerts/summary, logs+CSV. Global toasts (`components/Notifications.tsx`): emergency/help/signal lost/start/finish; Realtime has no `old` under RLS → `createStatusCache` (core) supplies previous status. Deploy: `scripts/deploy-admin.sh` (GitHub Pages, needs user OK: public surface).
- `supabase/migrations/0001_schema.sql` — one `sessions` table (kind official|private). Rules in DB: RLS, `participants_guard` trigger (only self accepts/tracks, tracking needs live+accepted, position fields server-only), coords readable only via `live_participants` view, RPCs `push_positions`/`raise_alert` (emergency official-only), `flag_lost_signals`, `purge_old_data` (pg_cron).
- `supabase/functions/log-ingest` — validation in `rows.ts` (pure, shared with tests).
- `supabase/tests` — SQL/RLS, e2e (supabase-js via `gateway.ts`), load, log-ingest, `realtime.test.ts` (needs full stack).
- `scripts/` — `deploy-admin.sh`, `test-db.sh` (podman pod: Postgres+GoTrue+PostgREST, ports 54329-54331), `demo.mts` (admin + live test event), `simulate.mts` (fake participants, finish at end; is_test sessions only).

## Commands
`npm test` (core) · `npm run test:db` · `npm run test:all` (+typecheck) · `npm run test:realtime` (full local stack) · `npm run test:e2e -w @mb/admin` (Playwright, needs demo data) · `npm run demo` / `npm run simulate -- --session <id>` (need SUPABASE_URL/ANON/SERVICE_ROLE env).
Last state: all suites green (core 26, db 38, realtime 5 local+cloud, admin Playwright 5 incl. notifications vs cloud).

## Environments
- Local full Supabase: `DOCKER_HOST=unix:///run/user/1000/podman/podman.sock npx supabase@2.121.0 start` (ports 553xx; user has another stack on 5432x — don't touch `*_top_reader`). Fedora SELinux: `chcon -Rt container_file_t supabase/functions`. Docker needs sudo; use podman.
- Cloud (test): org "Missão Barra", project ref `girnwfcrtvrsqcyktcrf` (sa-east-1). Secrets only in gitignored `supabase/.env.cloud`. Pooler: `postgres.girnwfcrtvrsqcyktcrf@aws-1-sa-east-1.pooler.supabase.com:5432`. Deploy: `db push`, `functions deploy log-ingest --use-api`, `config push`.
- Expo: `@rafacsasuke/missao-barra`, channel `preview`, env vars in EAS env `preview`, runtimeVersion policy `sdkVersion` (Expo Go). Publish: `cd apps/mobile && npx eas-cli@latest update --channel preview --environment preview --message "…"`. User tests on iPhone via Expo Go (free; no paid Apple account).
- Android toolchain installed: JDK 17 `~/.local/jdk/jdk-17.0.20.1+1`, SDK `~/Android/Sdk`, AVD `mb_pixel`, Maestro `~/.maestro` (flow `apps/mobile/.maestro/official-event.yaml`). Gradle debug build was interrupted, never completed; Maestro flow never run.
- Logins (supabase, eas) need a TTY: the user runs them in their own terminal.

## Pending
- Background GPS / battery tests need paid Apple account + `eas build` (or Android dev build).
- Field test per spec §7; Google Maps key for Android.
