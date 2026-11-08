/** Diretório de pessoas da organização (painel e app): filtros e ordenação puros. */
export interface PersonRow {
  id: string;
  display_name: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
  last_sign_in_at: string | null;
  phone: string | null;
  has_photo: boolean;
  registration_number: string | null;
  events_joined: number;
  events_started: number;
  races_started: number;
  total_km: number | string;
  calls: number;
  last_activity: string | null;
  /** Só preenchidos se a pessoa compartilhou o Strava com a organização. */
  strava_url?: string | null;
  strava_km_30d?: number | string | null;
}

export interface DirectoryFilter {
  q?: string;
  role?: 'all' | 'admin' | 'user';
  profile?: 'all' | 'complete' | 'incomplete';
  minEvents?: number;
  minRaces?: number;
  /** Atividade (participação ou login) nos últimos N dias; 0/undefined = qualquer. */
  activeDays?: number;
  /** Nunca participou de evento nem corrida. */
  neverParticipated?: boolean;
  /** Compartilha o Strava com a organização. */
  strava?: boolean;
}

export const DIRECTORY_SORT = {
  name: 'Nome',
  events: 'Mais eventos',
  races: 'Mais corridas',
  km: 'Mais km',
  recent: 'Atividade recente',
  strava: 'Mais km no Strava (30 dias)',
  newest: 'Cadastro mais novo',
} as const;
export type DirectorySort = keyof typeof DIRECTORY_SORT;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ts = (s: string | null) => (s ? Date.parse(s) : 0);
const lastSeen = (p: PersonRow) => Math.max(ts(p.last_activity), ts(p.last_sign_in_at));
export const isProfileComplete = (p: Pick<PersonRow, 'phone' | 'has_photo'>) => !!p.phone && p.has_photo;

export function filterDirectory(rows: PersonRow[], f: DirectoryFilter, now = Date.now()): PersonRow[] {
  const term = norm(f.q?.trim() ?? '');
  const digits = term.replace(/\D/g, '');
  return rows.filter((p) => {
    if (term) {
      const text = norm(`${p.display_name} ${p.email} ${p.registration_number ?? ''}`).includes(term);
      const phone = digits.length >= 3 && (p.phone ?? '').replace(/\D/g, '').includes(digits);
      if (!text && !phone) return false;
    }
    if (f.role && f.role !== 'all' && p.role !== f.role) return false;
    if (f.profile === 'complete' && !isProfileComplete(p)) return false;
    if (f.profile === 'incomplete' && isProfileComplete(p)) return false;
    if (f.minEvents && p.events_started < f.minEvents) return false;
    if (f.minRaces && p.races_started < f.minRaces) return false;
    if (f.neverParticipated && p.events_joined + p.races_started > 0) return false;
    if (f.strava && !p.strava_url) return false;
    if (f.activeDays && lastSeen(p) < now - f.activeDays * 86_400_000) return false;
    return true;
  });
}

export function sortDirectory(rows: PersonRow[], by: DirectorySort): PersonRow[] {
  const name = (a: PersonRow, b: PersonRow) => a.display_name.localeCompare(b.display_name, 'pt-BR');
  const desc = (k: (p: PersonRow) => number) => (a: PersonRow, b: PersonRow) => k(b) - k(a) || name(a, b);
  const cmp = {
    name,
    events: desc((p) => p.events_started),
    races: desc((p) => p.races_started),
    km: desc((p) => Number(p.total_km)),
    recent: desc(lastSeen),
    strava: desc((p) => Number(p.strava_km_30d ?? -1)),
    newest: desc((p) => ts(p.created_at)),
  }[by];
  return [...rows].sort(cmp);
}

/** Números do topo do diretório. */
export function directoryStats(rows: PersonRow[], now = Date.now()) {
  return {
    total: rows.length,
    admins: rows.filter((p) => p.role === 'admin').length,
    incomplete: rows.filter((p) => !isProfileComplete(p)).length,
    active30d: rows.filter((p) => lastSeen(p) >= now - 30 * 86_400_000).length,
    km: Math.round(rows.reduce((s, p) => s + Number(p.total_km), 0)),
  };
}

/** "08/11/2026 19:30" → ISO (horário local). null se inválida. Usado no app, que não tem seletor de data nativo. */
export function parseDateTimeBR(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0'] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi);
  if (date.getMonth() !== +mo - 1 || date.getDate() !== +d || +h > 23 || +mi > 59) return null;
  return date.toISOString();
}

/** Máscara de digitação para "DD/MM/AAAA HH:MM". */
export function maskDateTimeBR(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 12);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8), d.slice(8, 10), d.slice(10, 12)];
  let out = parts[0];
  if (d.length > 2) out += `/${parts[1]}`;
  if (d.length > 4) out += `/${parts[2]}`;
  if (d.length > 8) out += ` ${parts[3]}`;
  if (d.length > 10) out += `:${parts[4]}`;
  return out;
}
