# Missão Barra — agent context

GPS monitoring app (official events + private friend races, same tracking flow), admin panel, cloud logs. Spec: `~/Downloads/especificacao_app_missao_barra_v2.pdf`. Brand: `packages/ui-tokens` (from `missao-barra-brand-kit.zip`). UI text pt-BR. Repo: github.com/RafaelCostaF/missao-barra-app (main).

## Layout (npm workspaces)
- `packages/core` — all logic, framework-free, injected deps: `signal.ts` (stale >2min), `geo.ts` (haversine, accuracy filter, `toFix`), `queue.ts` (persistent offline position queue, backoff), `tracking.ts` (tracker: consent→tracking→finished; auto-stops GPS on server "not tracking"), `logger.ts` (sanitizes secrets/coords, offline buffer → log-ingest), `notifications.ts` (`toNotice`), `api.ts` (supabase-js data layer), `report.ts` (summary, CSV, `SESSION_ACTIONS`), `crowd.ts` (route distribution + attention outliers), `audit.ts` (report KPIs, funnel, formatters), `people.ts` (per-person flags/filters, search, tel/WhatsApp/Maps links).
- `apps/mobile` — Expo SDK 58, expo-router (`src/app`), `src/lib/{services,location,bootstrap}.ts`. Single session screen `src/app/session/[id].tsx` for both kinds; tab `profile.tsx` (photo via `lib/photo.ts`, SMS phone verification, emergency/health, sign out); battery sent with each position batch (`expo-battery`). Expo Go has no background GPS → `location.ts` falls back to `watchPositionAsync` + keep-awake. Android without `GOOGLE_MAPS_API_KEY` shows list instead of map (`LiveMap.tsx`).
- `apps/admin` — Vite + React + Leaflet, hash routes: events CRUD/lifecycle, route editor, live map/alerts/summary, logs+CSV. Event tabs: Monitoramento (map + 3 KPIs + distribution + attention), Participantes (`PeopleTab.tsx`: filter chips, search by name/registration/phone, profile modal with contact + timeline), Alertas, Relatório (`ReportTab.tsx`: KPIs, funnel, per-person timeline), Percurso. Alerts never overlay monitoring: header `AlertCenter` (blinking border + modal with open alerts and start/finish feed); Realtime has no `old` under RLS → `createStatusCache` (core) supplies previous status. Deploy: `scripts/deploy-admin.sh` (GitHub Pages, needs user OK: public surface).
- `supabase/migrations/0004_profile_security.sql` — phone synced from Auth only after SMS verification (column grants block direct writes), `photo_path` (private Storage bucket `avatars/<uid>/…`), `health_notes`, `participants.battery` (via `push_positions(..., p_battery)`), official start requires `profile_complete()` (photo + verified phone), staff RPCs `list_staff`/`set_staff`.
- `supabase/migrations/0005_phone_guard.sql` — phone counts as verified only if `phone_change_sent_at` is set (hosted Auth was auto-confirming phone changes without a code).
- `supabase/migrations/0003_contacts.sql` — `profile_contacts` (phone, registration, emergency contact): readable only by self + admin (profiles is public to logged users for friend search, so contacts live apart).
- `supabase/migrations/0002_reports.sql` — audit `participant_events` (trigger), `alerts.resolved_by`, `session_report()` RPC, durable `participant_summaries` snapshot on session end (2-year retention). Migrations 0001–0005 applied to cloud.
- `supabase/migrations/0001_schema.sql` — one `sessions` table (kind official|private). Rules in DB: RLS, `participants_guard` trigger (only self accepts/tracks, tracking needs live+accepted, position fields server-only), coords readable only via `live_participants` view, RPCs `push_positions`/`raise_alert` (emergency official-only), `flag_lost_signals`, `purge_old_data` (pg_cron).
- `supabase/functions/log-ingest` — validation in `rows.ts` (pure, shared with tests).
- `supabase/tests` — SQL/RLS, e2e (supabase-js via `gateway.ts`), load, log-ingest, `realtime.test.ts` (needs full stack).
- `scripts/` — `deploy-admin.sh`, `test-db.sh` (podman pod: Postgres+GoTrue+PostgREST, ports 54329-54331), `demo.mts` (admin + live test event), `simulate.mts` (fake participants, finish at end; is_test sessions only).

## Commands
`npm test` (core) · `npm run test:db` · `npm run test:all` (+typecheck) · `npm run test:realtime` (full local stack) · `npm run test:e2e -w @mb/admin` (Playwright, needs demo data) · `npm run demo` / `npm run simulate -- --session <id>` (need SUPABASE_URL/ANON/SERVICE_ROLE env).
Last state: all suites green (core 38, db 51, full-stack 9 = realtime + signup-flow, admin Playwright 9 vs cloud incl. mobile viewport; mobile lint/doctor clean).

## Environments
- Local full Supabase: `DOCKER_HOST=unix:///run/user/1000/podman/podman.sock npx supabase@2.121.0 start` (ports 553xx; user has another stack on 5432x — don't touch `*_top_reader`). Fedora SELinux: `chcon -Rt container_file_t supabase/functions`. Docker needs sudo; use podman.
- Cloud (test): org "Missão Barra", project ref `girnwfcrtvrsqcyktcrf` (sa-east-1). Secrets only in gitignored `supabase/.env.cloud`. Pooler: `postgres.girnwfcrtvrsqcyktcrf@aws-1-sa-east-1.pooler.supabase.com:5432`. Deploy: `db push`, `functions deploy log-ingest --use-api`, `config push`.
- Expo: `@rafacsasuke/missao-barra`, channel `preview`, env vars in EAS env `preview`, runtimeVersion policy `sdkVersion` (Expo Go). Stable Expo Go URL: `exp://u.expo.dev/f1f9e090-e263-40ea-b0db-48d52a133698?channel-name=preview&runtime-version=exposdk:58.0.0`. Publish: `cd apps/mobile && npx eas-cli@latest update --channel preview --environment preview --message "…"`. User tests on iPhone via Expo Go (free; no paid Apple account).
- Android toolchain installed: JDK 17 `~/.local/jdk/jdk-17.0.20.1+1`, SDK `~/Android/Sdk`, AVD `mb_pixel`, Maestro `~/.maestro` (flow `apps/mobile/.maestro/official-event.yaml`). Gradle debug build was interrupted, never completed; Maestro flow never run.
- Mobile UI kit `src/components/ui.tsx` (FadeIn, PulseDot, Stat, Empty, haptics); Animated values via `useState(() => new Animated.Value())` (React Compiler lint).
- Panel deploy (`scripts/deploy-admin.sh`) and public publishing are blocked by the permission classifier: the user runs them.
- Cloud e2e tests create `*@teste.dev` users: delete them afterwards (they never touch real users' alerts).
- Auth: password ≥8 letters+digits; `[auth.sms]` enabled + `enable_confirmations = true` + test numbers 5571900000001-3 (code 123456). Twilio values are placeholders in gitignored `supabase/.env` → real SMS only after the user creates a Twilio account. In the CLOUD, phone change is still auto-confirmed by hosted Auth (fix in Dashboard › Auth › Phone with real Twilio); until then nobody can verify phone there → official events blocked for real accounts (0005 guard).
- Admin panel: header `AlertCenter`, pages Eventos/Equipe/Logs, all modals via portal `components/Modal.tsx` (transform ancestors broke position:fixed). Responsive (<700px) + PWA manifest. Default admin: `npm run create-admin -- --email …` (cloud: `admin@missaobarra.test`, password in `.env.cloud`).
- Admin e2e participants are completed with the service role (`e2e/participant.ts`, needs SUPABASE_SERVICE_ROLE_KEY).
- After reinstalling deps run `npx playwright install chromium` (browser version follows @playwright/test).
- Logins (supabase, eas) need a TTY: the user runs them in their own terminal.

## Pending
- Background GPS / battery tests need paid Apple account + `eas build` (or Android dev build).
- Field test per spec §7; Google Maps key for Android.
