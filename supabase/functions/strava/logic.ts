// Regras puras da integração com o Strava (compartilhadas com os testes em Node).

export const STRAVA = 'https://www.strava.com';
/** activity:read não inclui atividades "Só você" no Strava (privacidade). */
export const SCOPE = 'read,activity:read';
/** Primeira sincronização busca no máximo este período. */
export const FIRST_SYNC_DAYS = 90;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

export interface State { u: string; r: string; exp: number }

/** `state` do OAuth assinado: liga o retorno do Strava ao usuário que iniciou (sem sessão no navegador). */
export async function signState(secret: string, s: State) {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyState(secret: string, token: string | null, now = Date.now()): Promise<State | null> {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig || (await hmac(secret, body)) !== sig) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as State;
    return s.exp > now && typeof s.u === 'string' && isAllowedReturn(s.r) ? s : null;
  } catch {
    return null;
  }
}

/** Só volta para o próprio app (evita redirecionamento aberto). */
export const isAllowedReturn = (url: unknown): url is string =>
  typeof url === 'string' && /^(missaobarra|exp|exps):\/\//.test(url) && url.length < 300;

/** Login web dentro da sessão de autenticação do app (o retorno https fecha a janela de forma confiável). */
export const authorizeUrl = (clientId: string, redirectUri: string, state: string) =>
  `${STRAVA}/oauth/authorize?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state,
  })}`;

/** Renova com 5 min de folga (tokens do Strava valem ~6 h). */
export const needsRefresh = (expiresAt: string, now = Date.now()) => Date.parse(expiresAt) - now < 5 * 60_000;

export interface StravaActivity {
  id: number; name?: string; sport_type?: string; type?: string; start_date: string;
  distance?: number; moving_time?: number; elapsed_time?: number; total_elevation_gain?: number;
}

/** Só o resumo: nada de trajeto/polyline do Strava. */
export const toActivityRow = (userId: string, a: StravaActivity) => ({
  id: a.id,
  user_id: userId,
  name: a.name?.slice(0, 200) ?? null,
  sport_type: a.sport_type ?? a.type ?? null,
  start_date: a.start_date,
  distance_m: a.distance ?? 0,
  moving_time_s: Math.round(a.moving_time ?? 0),
  elapsed_time_s: Math.round(a.elapsed_time ?? 0),
  elevation_gain_m: a.total_elevation_gain ?? null,
});

export const athleteName = (a: { firstname?: string; lastname?: string } | undefined) =>
  [a?.firstname, a?.lastname].filter(Boolean).join(' ').trim() || null;

/** Página de retorno quando o app não reabre sozinho. */
export const resultPage = (ok: boolean, back: string | null) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Missão Barra</title>` +
  `<body style="font-family:system-ui;padding:32px;background:#1D1E22;color:#FFF9F4"><h2>${ok ? 'Strava conectado ✓' : 'Não foi possível conectar o Strava'}</h2>` +
  (back ? `<p><a style="color:#EB6D35" href="${back.replace(/"/g, '&quot;')}">Voltar para o app</a></p>` : '') + `</body>`;
