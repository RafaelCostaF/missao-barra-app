/** Integração Strava: tipos, links oficiais e resumo das atividades (puro, usado no app e no painel). */
export interface StravaAccount {
  user_id: string;
  /** Só com a API (conexão via login no Strava). */
  athlete_id: number | null;
  athlete_name: string | null;
  /** Link informado pela própria pessoa (sem API). */
  profile_url: string | null;
  share_with_org: boolean;
  share_with_friends: boolean;
  connected_at: string;
  last_sync_at: string | null;
}
export interface StravaActivity {
  id: number;
  user_id: string;
  name: string | null;
  sport_type: string | null;
  start_date: string;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  elevation_gain_m: number | null;
}

/** Laranja oficial do Strava (botões/links da marca). */
export const STRAVA_ORANGE = '#FC5200';
export const stravaAthleteUrl = (athleteId: number | string) => `https://www.strava.com/athletes/${athleteId}`;
/** Link do perfil: o informado ou o derivado da conta conectada. */
export const stravaLink = (a: Pick<StravaAccount, 'profile_url' | 'athlete_id'>) =>
  a.profile_url ?? (a.athlete_id != null ? stravaAthleteUrl(a.athlete_id) : null);

/**
 * Aceita o que a pessoa cola: link do site (strava.com/athletes/123), link curto do app (strava.app.link/xyz)
 * ou só o número do atleta. Devolve a URL https normalizada, ou null se não for um perfil do Strava.
 */
export function parseStravaProfile(input: string): string | null {
  const t = input.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (/^\d{1,15}$/.test(t)) return stravaAthleteUrl(t);
  const m = t.match(/^(?:https?:\/\/)?(?:www\.|m\.)?strava\.com\/athletes\/([A-Za-z0-9_-]{1,40})$/i);
  if (m) return stravaAthleteUrl(m[1]);
  const short = t.match(/^(?:https?:\/\/)?strava\.app\.link\/([A-Za-z0-9_-]{1,40})$/i);
  return short ? `https://strava.app.link/${short[1]}` : null;
}

export const stravaActivityUrl = (activityId: number | string) => `https://www.strava.com/activities/${activityId}`;

export const SPORT_LABEL: Record<string, string> = {
  Run: 'Corrida', TrailRun: 'Trilha', Walk: 'Caminhada', Hike: 'Trekking', VirtualRun: 'Corrida virtual',
  Ride: 'Pedal', MountainBikeRide: 'Mountain bike', GravelRide: 'Gravel', VirtualRide: 'Pedal virtual', EBikeRide: 'E-bike',
  Swim: 'Natação', Workout: 'Treino', WeightTraining: 'Musculação', Yoga: 'Yoga',
};
export const sportLabel = (t: string | null) => (t ? SPORT_LABEL[t] ?? t : 'Atividade');
const FOOT = new Set(['Run', 'TrailRun', 'Walk', 'Hike', 'VirtualRun']);
/** Corrida/caminhada (o que interessa para a Missão Barra). */
export const isOnFoot = (t: string | null) => !!t && FOOT.has(t);

/** Resumo dos últimos `days` dias: total de atividades a pé, km, maior distância e ritmo médio. */
export function stravaSummary(acts: Pick<StravaActivity, 'sport_type' | 'start_date' | 'distance_m' | 'moving_time_s'>[], days = 30, now = Date.now()) {
  const recent = acts.filter((a) => isOnFoot(a.sport_type) && Date.parse(a.start_date) >= now - days * 86_400_000);
  const meters = recent.reduce((s, a) => s + a.distance_m, 0);
  const secs = recent.reduce((s, a) => s + a.moving_time_s, 0);
  return {
    count: recent.length,
    km: Math.round(meters / 100) / 10,
    longestKm: Math.round(Math.max(0, ...recent.map((a) => a.distance_m)) / 100) / 10,
    /** min/km médio ("6:05"), null sem dados. */
    pace: meters >= 100 && secs ? fmtPace(secs / (meters / 1000)) : null,
  };
}
const fmtPace = (sPerKm: number) => `${Math.floor(sPerKm / 60)}:${String(Math.round(sPerKm % 60)).padStart(2, '0')}`;
