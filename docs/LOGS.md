# Logs em nuvem — acesso para diagnóstico

Logs técnicos ficam na tabela `app_logs` do Supabase (um projeto por ambiente: **test** e **prod**).
Não contêm coordenadas, tokens nem senhas (sanitizados no cliente — `packages/core/src/logger.ts` — e de novo em `supabase/functions/log-ingest`).
Retenção: 90 dias (`pg_cron`). A trilha GPS fica separada em `positions` (30 dias, só admin).

## Fluxo
App/painel → `logger` (buffer local, persiste offline) → `POST /functions/v1/log-ingest` (lote, JWT do usuário) → `app_logs`.
Erros disparam envio imediato; demais níveis saem no próximo `flush()` (ao reconectar, ao entrar em 2º plano ou a cada envio de posições).

## Campos
`ts, level, event, session_id, pseudo_user, app_version, os, device, latency_ms, error, meta`.
`pseudo_user` = `profiles.pseudo_id` (não é o id da conta). Para ligar a um usuário real, só um admin, via `profiles`.

## Eventos padronizados (`event`)
`session.start` · `session.end` · `gps.permission_denied` · `gps.error` · `net.offline` · `net.online` ·
`positions.push` (com `ok`, `latency_ms`, `count`, `queued`) · `api.<recurso>` · `auth.error` · `app.crash`.

## Acesso do agente (somente leitura)
Usar uma conta com `role = 'admin'` **no projeto de teste**, ou a REST API com a chave dessa conta. Nunca colar a service role key em logs ou chats.

```bash
# Erros das últimas 24 h numa versão
curl "$SUPABASE_URL/rest/v1/app_logs?level=eq.error&app_version=eq.1.0.0&ts=gte.$(date -u -d '-1 day' +%FT%TZ)&order=ts.desc" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $ADMIN_JWT"

# Sequência completa de uma sessão
curl "$SUPABASE_URL/rest/v1/app_logs?session_id=eq.<uuid>&order=ts.asc" -H "apikey: ..." -H "Authorization: Bearer ..."

# Exportar CSV
curl "$SUPABASE_URL/rest/v1/app_logs?event=eq.positions.push&select=*" -H "Accept: text/csv" -H "apikey: ..." -H "Authorization: Bearer ..."
```

SQL útil (SQL editor do Supabase):
```sql
select event, count(*), avg(latency_ms) from app_logs
where ts > now() - interval '1 day' and level = 'error' group by 1 order by 2 desc;
```
