import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, pool, signUp, sys } from './helpers';

let admin: string, ana: string, amigo: string, estranho: string;
const athlete = Math.floor(Math.random() * 1e9);
beforeAll(async () => {
  admin = await signUp('admin-strava', 'admin');
  ana = await signUp('ana-strava');
  amigo = await signUp('amigo-strava');
  estranho = await signUp('estranho-strava');
  await sys(`insert into friendships (requester, addressee, status) values ($1, $2, 'accepted')`, [ana, amigo]);
  // Conexão feita pela Edge Function (service role).
  await sys(`insert into strava_accounts (user_id, athlete_id, athlete_name) values ($1, $2, 'Ana S.')`, [ana, athlete]);
  await sys(`insert into strava_tokens (user_id, access_token, refresh_token, expires_at) values ($1, 'acc', 'ref', now())`, [ana]);
  await sys(`insert into strava_activities (id, user_id, name, sport_type, start_date, distance_m, moving_time_s) values ($1, $2, 'Orla', 'Run', now() - interval '2 days', 10000, 3300)`, [athlete, ana]);
});
afterAll(() => pool.end());

const accountsSeenBy = (u: string) => as(u, (q) => q(`select athlete_id from strava_accounts where user_id = $1`, [ana]));
const activitiesSeenBy = (u: string) => as(u, (q) => q(`select id from strava_activities where user_id = $1`, [ana]));
const share = (col: 'share_with_org' | 'share_with_friends', v: boolean) =>
  as(ana, (q) => q(`update strava_accounts set ${col} = $2 where user_id = $1`, [ana, v]));

describe('strava: consentimento', () => {
  it('tokens nunca são legíveis por clientes (nem pelo dono ou admin)', async () => {
    await expect(as(ana, (q) => q(`select * from strava_tokens`))).rejects.toThrow(/permission denied/);
    await expect(as(admin, (q) => q(`select * from strava_tokens`))).rejects.toThrow(/permission denied/);
  });
  it('sem consentimento: só a própria pessoa vê conta e atividades', async () => {
    expect(await accountsSeenBy(ana)).toHaveLength(1);
    expect(await activitiesSeenBy(ana)).toHaveLength(1);
    for (const u of [admin, amigo, estranho]) {
      expect(await accountsSeenBy(u)).toHaveLength(0);
      expect(await activitiesSeenBy(u)).toHaveLength(0);
    }
    const [row] = await as(admin, (q) => q(`select strava_url from admin_people() where id = $1`, [ana]));
    expect(row.strava_url).toBeNull();
  });
  it('compartilhar com a organização libera atividades só para admin', async () => {
    await share('share_with_org', true);
    expect(await activitiesSeenBy(admin)).toHaveLength(1);
    expect(await activitiesSeenBy(amigo)).toHaveLength(0);
    const [row] = await as(admin, (q) => q(`select strava_url, strava_km_30d from admin_people() where id = $1`, [ana]));
    expect(row.strava_url).toBe(`https://www.strava.com/athletes/${athlete}`);
    expect(Number(row.strava_km_30d)).toBe(10);
    await share('share_with_org', false);
    expect(await activitiesSeenBy(admin)).toHaveLength(0);
  });
  it('compartilhar com amigos mostra o perfil só a amigos aceitos (nunca as atividades)', async () => {
    await share('share_with_friends', true);
    expect(await accountsSeenBy(amigo)).toHaveLength(1);
    expect(await activitiesSeenBy(amigo)).toHaveLength(0);
    expect(await accountsSeenBy(estranho)).toHaveLength(0);
  });
  it('ninguém forja conexão, atividade ou troca o atleta; outro usuário não muda o consentimento', async () => {
    await expect(as(estranho, (q) => q(`insert into strava_accounts (user_id, athlete_id) values ($1, 1)`, [estranho]))).rejects.toThrow(/permission denied/);
    await expect(as(ana, (q) => q(`insert into strava_activities (id, user_id, start_date) values (1, $1, now())`, [ana]))).rejects.toThrow(/permission denied/);
    await expect(as(ana, (q) => q(`update strava_accounts set athlete_id = 1 where user_id = $1`, [ana]))).rejects.toThrow(/permission denied/);
    expect(await as(estranho, (q) => q(`update strava_accounts set share_with_org = true where user_id = $1 returning user_id`, [ana]))).toHaveLength(0);
  });
});

describe('strava sem API: link do perfil informado pela pessoa', () => {
  const link = 'https://www.strava.com/athletes/beto123';
  it('cria o próprio link (válido), com consentimento opt-in', async () => {
    await expect(as(estranho, (q) => q(`insert into strava_accounts (user_id, profile_url) values ($1, 'https://evil.com/x')`, [estranho]))).rejects.toThrow(/check/);
    await expect(as(estranho, (q) => q(`insert into strava_accounts (user_id, profile_url) values ($1, $2)`, [amigo, link]))).rejects.toThrow(/row-level security/);
    await as(amigo, (q) => q(`insert into strava_accounts (user_id, profile_url, share_with_friends) values ($1, $2, true)`, [amigo, link]));
    await expect(as(amigo, (q) => q(`insert into strava_accounts (user_id) values ($1)`, [estranho]))).rejects.toThrow();
  });
  it('amiga vê o link; organização só se liberado; dá para trocar e remover', async () => {
    const seen = (u: string) => as(u, (q) => q(`select profile_url from strava_accounts where user_id = $1`, [amigo]));
    expect(await seen(ana)).toEqual([{ profile_url: link }]);
    expect(await seen(estranho)).toHaveLength(0);
    expect((await as(admin, (q) => q(`select strava_url from admin_people() where id = $1`, [amigo])))[0].strava_url).toBeNull();
    await as(amigo, (q) => q(`update strava_accounts set share_with_org = true, profile_url = 'https://strava.app.link/AbC9' where user_id = $1`, [amigo]));
    expect((await as(admin, (q) => q(`select strava_url, strava_km_30d from admin_people() where id = $1`, [amigo])))[0]).toEqual({ strava_url: 'https://strava.app.link/AbC9', strava_km_30d: null });
    await as(amigo, (q) => q(`delete from strava_accounts where user_id = $1`, [amigo]));
    expect(await as(amigo, (q) => q(`select 1 from strava_accounts where user_id = $1`, [amigo]))).toHaveLength(0);
  });
});
