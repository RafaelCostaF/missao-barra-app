// Registra (ou mostra) a inscrição do webhook do Strava: novas atividades chegam sozinhas, sem consultar a API.
// Uso: STRAVA_CLIENT_ID=… STRAVA_CLIENT_SECRET=… STRAVA_VERIFY_TOKEN=… SUPABASE_URL=… npx tsx scripts/strava-webhook.mts
const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret, STRAVA_VERIFY_TOKEN: verify, SUPABASE_URL: url } = process.env;
if (!id || !secret || !verify || !url) {
  console.error('Defina STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_VERIFY_TOKEN e SUPABASE_URL.');
  process.exit(1);
}
const api = 'https://www.strava.com/api/v3/push_subscriptions';
const existing = await (await fetch(`${api}?${new URLSearchParams({ client_id: id, client_secret: secret })}`)).json();
if (Array.isArray(existing) && existing.length) {
  console.log('Inscrição já existe:', existing);
  process.exit(0);
}
// O Strava chama o callback (GET hub.challenge) durante este POST: a função `strava` precisa estar no ar.
const r = await fetch(api, {
  method: 'POST',
  body: new URLSearchParams({ client_id: id, client_secret: secret, callback_url: `${url}/functions/v1/strava/webhook`, verify_token: verify }),
});
console.log(r.status, await r.text());
