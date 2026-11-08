import { describe, expect, it } from 'vitest';
import { directoryStats, filterDirectory, isOnFoot, parseStravaProfile, maskDateTimeBR, parseDateTimeBR, sortDirectory, sportLabel, stravaSummary, type PersonRow } from '../src';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const person = (p: Partial<PersonRow>): PersonRow => ({
  id: p.display_name!, display_name: '', email: 'x@teste.dev', role: 'user', created_at: day(100), last_sign_in_at: null,
  phone: '+5571999990000', has_photo: true, registration_number: null, events_joined: 0, events_started: 0, races_started: 0,
  total_km: 0, calls: 0, last_activity: null, ...p,
});
const rows = [
  person({ display_name: 'Ana Souza', email: 'ana@x.dev', events_joined: 3, events_started: 3, races_started: 1, total_km: '120.5', last_activity: day(2) }),
  person({ display_name: 'Bruno Lima', role: 'admin', events_joined: 1, events_started: 1, total_km: 40, last_sign_in_at: day(40) }),
  person({ display_name: 'Célia Dias', phone: null, has_photo: false, races_started: 4, total_km: 15, registration_number: 'MB-0042', created_at: day(1) }),
  person({ display_name: 'Davi Rocha', phone: '+5571988887777' }),
];
const names = (r: PersonRow[]) => r.map((p) => p.display_name);

describe('diretório de pessoas', () => {
  it('busca por nome sem acento, e-mail, inscrição e celular', () => {
    expect(names(filterDirectory(rows, { q: 'celia' }))).toEqual(['Célia Dias']);
    expect(names(filterDirectory(rows, { q: 'ana@' }))).toEqual(['Ana Souza']);
    expect(names(filterDirectory(rows, { q: 'mb-0042' }))).toEqual(['Célia Dias']);
    expect(names(filterDirectory(rows, { q: '98888' }))).toEqual(['Davi Rocha']);
  });
  it('filtra por papel, cadastro, mínimos, inatividade e atividade recente', () => {
    expect(names(filterDirectory(rows, { role: 'admin' }))).toEqual(['Bruno Lima']);
    expect(names(filterDirectory(rows, { profile: 'incomplete' }))).toEqual(['Célia Dias']);
    expect(names(filterDirectory(rows, { minEvents: 2 }))).toEqual(['Ana Souza']);
    expect(names(filterDirectory(rows, { minRaces: 1 }))).toEqual(['Ana Souza', 'Célia Dias']);
    expect(names(filterDirectory(rows, { neverParticipated: true }))).toEqual(['Davi Rocha']);
    expect(names(filterDirectory(rows, { activeDays: 30 }, NOW))).toEqual(['Ana Souza']);
    expect(names(filterDirectory(rows, { activeDays: 60 }, NOW))).toEqual(['Ana Souza', 'Bruno Lima']);
  });
  it('ordena e resume', () => {
    expect(names(sortDirectory(rows, 'km'))[0]).toBe('Ana Souza');
    expect(names(sortDirectory(rows, 'races'))[0]).toBe('Célia Dias');
    expect(names(sortDirectory(rows, 'newest'))[0]).toBe('Célia Dias');
    expect(names(sortDirectory(rows, 'name'))).toEqual(['Ana Souza', 'Bruno Lima', 'Célia Dias', 'Davi Rocha']);
    expect(directoryStats(rows, NOW)).toEqual({ total: 4, admins: 1, incomplete: 1, active30d: 1, km: 176 });
  });
});

describe('data e hora digitadas', () => {
  it('máscara e conversão', () => {
    expect(maskDateTimeBR('081120261930')).toBe('08/11/2026 19:30');
    expect(maskDateTimeBR('0811')).toBe('08/11');
    const iso = parseDateTimeBR('08/11/2026 19:30')!;
    expect(new Date(iso).getHours()).toBe(19);
    expect(parseDateTimeBR('08/11/2026')).not.toBeNull();
    expect(parseDateTimeBR('31/02/2026 10:00')).toBeNull();
    expect(parseDateTimeBR('08/11/2026 25:00')).toBeNull();
    expect(parseDateTimeBR('ontem')).toBeNull();
  });
});

describe('strava', () => {
  it('resume só atividades a pé dos últimos 30 dias', () => {
    const acts = [
      { sport_type: 'Run', start_date: day(2), distance_m: 10_000, moving_time_s: 3600 },
      { sport_type: 'Walk', start_date: day(10), distance_m: 5_000, moving_time_s: 3000 },
      { sport_type: 'Ride', start_date: day(3), distance_m: 40_000, moving_time_s: 5400 },
      { sport_type: 'Run', start_date: day(45), distance_m: 21_000, moving_time_s: 7200 },
    ];
    expect(stravaSummary(acts, 30, NOW)).toEqual({ count: 2, km: 15, longestKm: 10, pace: '7:20' });
    expect(stravaSummary([], 30, NOW)).toEqual({ count: 0, km: 0, longestKm: 0, pace: null });
    expect(isOnFoot('TrailRun')).toBe(true);
    expect(sportLabel('Run')).toBe('Corrida');
    expect(sportLabel('Kitesurf')).toBe('Kitesurf');
  });
  it('filtra quem compartilha o Strava e ordena por km no Strava', () => {
    const withStrava = [...rows, person({ display_name: 'Eva Strava', strava_url: 'https://www.strava.com/athletes/5', strava_km_30d: '88.0' })];
    expect(names(filterDirectory(withStrava, { strava: true }))).toEqual(['Eva Strava']);
    expect(names(sortDirectory(withStrava, 'strava'))[0]).toBe('Eva Strava');
  });
});

describe('link do perfil Strava (sem API)', () => {
  it('aceita link do site, do app ou o número; recusa outros sites', () => {
    expect(parseStravaProfile('https://www.strava.com/athletes/12345')).toBe('https://www.strava.com/athletes/12345');
    expect(parseStravaProfile(' strava.com/athletes/12345/ ')).toBe('https://www.strava.com/athletes/12345');
    expect(parseStravaProfile('https://www.strava.com/athletes/12345?utm_source=x')).toBe('https://www.strava.com/athletes/12345');
    expect(parseStravaProfile('12345')).toBe('https://www.strava.com/athletes/12345');
    expect(parseStravaProfile('https://strava.app.link/Ab12cD')).toBe('https://strava.app.link/Ab12cD');
    expect(parseStravaProfile('https://evil.com/athletes/1')).toBeNull();
    expect(parseStravaProfile('https://www.strava.com/activities/99')).toBeNull();
    expect(parseStravaProfile('')).toBeNull();
  });
});
