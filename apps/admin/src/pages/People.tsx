import { useEffect, useMemo, useState } from 'react';
import {
  DIRECTORY_SORT, directoryStats, filterDirectory, fmtDuration, formatPhoneBR, isProfileComplete, sortDirectory, sportLabel, stravaActivityUrl,
  stravaSummary, telLink, toCsv, whatsappLink,
  type Api, type Contact, type DirectoryFilter, type DirectorySort, type PersonRow, type StravaActivity,
} from '@mb/core';
import { api, download, run } from '../lib';
import { Modal } from '../components/Modal';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const STATUS: Record<string, string> = { accepted: 'Inscrito', tracking: 'Em percurso', finished: 'Finalizou' };

/** Todas as contas: busca, filtros (papel, cadastro, participação, atividade), ordenação, CSV e perfil. */
export function People() {
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [f, setF] = useState<DirectoryFilter>({ role: 'all', profile: 'all' });
  const [sort, setSort] = useState<DirectorySort>('name');
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => run('admin.people', api.people).then((r) => setRows(r ?? []));
  useEffect(() => void load(), []);

  const shown = useMemo(() => sortDirectory(filterDirectory(rows ?? [], f), sort), [rows, f, sort]);
  if (!rows) return <div className="card skeleton">Carregando pessoas…</div>;
  const st = directoryStats(rows);
  const set = <K extends keyof DirectoryFilter>(k: K) => (v: DirectoryFilter[K]) => setF({ ...f, [k]: v });
  const num = (v: string) => (v ? Number(v) : undefined);
  const person = rows.find((r) => r.id === selected);

  return (
    <>
      <div className="kpis kpis-5 fade-in">
        <div className="kpi"><b>{st.total}</b>Contas</div>
        <div className="kpi"><b>{st.admins}</b>Organizadores</div>
        <div className="kpi ok"><b>{st.active30d}</b>Ativos em 30 dias</div>
        <div className="kpi warn"><b>{st.incomplete}</b>Cadastro incompleto</div>
        <div className="kpi"><b>{st.km}</b>km percorridos</div>
      </div>

      <div className="card row fade-in">
        <input className="search" placeholder="Buscar por nome, e-mail, inscrição ou celular" value={f.q ?? ''} onChange={(e) => set('q')(e.target.value)} />
        <select aria-label="Papel" value={f.role} onChange={(e) => set('role')(e.target.value as DirectoryFilter['role'])}>
          <option value="all">Todos os papéis</option><option value="admin">Organizadores</option><option value="user">Participantes</option>
        </select>
        <select aria-label="Cadastro" value={f.profile} onChange={(e) => set('profile')(e.target.value as DirectoryFilter['profile'])}>
          <option value="all">Qualquer cadastro</option><option value="complete">Cadastro completo</option><option value="incomplete">Cadastro incompleto</option>
        </select>
        <label>Eventos ≥ <input type="number" min={0} style={{ width: 70 }} value={f.minEvents ?? ''} onChange={(e) => set('minEvents')(num(e.target.value))} /></label>
        <label>Corridas ≥ <input type="number" min={0} style={{ width: 70 }} value={f.minRaces ?? ''} onChange={(e) => set('minRaces')(num(e.target.value))} /></label>
        <select aria-label="Atividade" value={f.activeDays ?? 0} onChange={(e) => set('activeDays')(Number(e.target.value) || undefined)}>
          <option value={0}>Qualquer atividade</option><option value={7}>Ativos em 7 dias</option><option value={30}>Ativos em 30 dias</option><option value={365}>Ativos em 1 ano</option>
        </select>
        <label className="row"><input type="checkbox" checked={!!f.neverParticipated} onChange={(e) => set('neverParticipated')(e.target.checked)} /> Nunca participou</label>
        <label className="row"><input type="checkbox" checked={!!f.strava} onChange={(e) => set('strava')(e.target.checked)} /> Com Strava</label>
        <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as DirectorySort)}>
          {(Object.keys(DIRECTORY_SORT) as DirectorySort[]).map((k) => <option key={k} value={k}>{DIRECTORY_SORT[k]}</option>)}
        </select>
        <button className="secondary" onClick={() => download('pessoas.csv', toCsv(shown.map((p) => ({
          nome: p.display_name, email: p.email, papel: p.role, celular: p.phone, foto: p.has_photo ? 'sim' : 'não', inscricao: p.registration_number,
          eventos_inscritos: p.events_joined, eventos_iniciados: p.events_started, corridas: p.races_started, km: p.total_km, chamados: p.calls,
          cadastro: p.created_at, ultimo_login: p.last_sign_in_at, ultima_atividade: p.last_activity, strava_km_30d: p.strava_km_30d ?? '',
        }))))}>CSV</button>
      </div>

      <div className="card scroll fade-in">
        <h3>{shown.length} de {rows.length} pessoas</h3>
        <table>
          <thead><tr><th>Nome</th><th className="hide-sm">E-mail</th><th>Eventos</th><th>Corridas</th><th className="hide-sm">km</th><th className="hide-sm">Chamados</th><th className="hide-sm">Última atividade</th><th>Cadastro</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => setSelected(p.id)}>
                <td><b>{p.display_name}</b> {p.role === 'admin' && <span className="badge finished">org</span>} {p.strava_url ? <span className="badge strava" title={p.strava_km_30d != null ? `${Number(p.strava_km_30d).toFixed(0)} km no Strava em 30 dias` : 'Perfil Strava compartilhado'}>Strava</span> : null}</td>
                <td className="hide-sm">{p.email}</td>
                <td title={`${p.events_joined} inscrições`}>{p.events_started}</td>
                <td>{p.races_started}</td>
                <td className="hide-sm">{Number(p.total_km).toFixed(1)}</td>
                <td className="hide-sm">{p.calls || '—'}</td>
                <td className="hide-sm">{fmtDate(p.last_activity ?? p.last_sign_in_at)}</td>
                <td>{isProfileComplete(p) ? <span className="badge tracking">completo</span> : <span className="badge stale">incompleto</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="muted">Ninguém com esses filtros.</p>}
      </div>
      {person && <PersonProfile person={person} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  );
}

type History = Awaited<ReturnType<Api['personHistory']>>;

function PersonProfile({ person: p, onClose, onChanged }: { person: PersonRow; onClose: () => void; onChanged: () => void }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [me, setMe] = useState('');
  const [strava, setStrava] = useState<StravaActivity[]>([]);
  useEffect(() => {
    void api.me().then(setMe);
    // Só retorna algo se a pessoa liberou o Strava para a organização (RLS).
    if (p.strava_km_30d != null) void api.stravaActivities(p.id, 10).then(setStrava).catch(() => undefined);
    void api.personHistory(p.id).then(setHistory).catch(() => undefined);
    void api.contactOf(p.id).then(async (c) => {
      setContact(c);
      if (c?.photo_path) setPhoto(await api.photoUrl(c.photo_path).catch(() => null));
    }).catch(() => undefined);
  }, [p.id, p.strava_km_30d]);

  async function toggleAdmin() {
    const make = p.role !== 'admin';
    const msg = make ? `Tornar ${p.display_name} organizador? A pessoa passa a ver localização, contatos e logs de todos os eventos oficiais.` : `Retirar o acesso de organizador de ${p.display_name}?`;
    if (!confirm(msg)) return;
    if (await run('admin.set_admin', () => api.setAdmin(p.id, make)) !== undefined) onChanged();
  }

  return (
    <Modal label={`Perfil de ${p.display_name}`} onClose={onClose}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 14 }}>
          {photo ? <img className="avatar" src={photo} alt={`Foto de ${p.display_name}`} /> : <div className="avatar empty" aria-label="Sem foto">?</div>}
          <div>
            <h2 style={{ marginBottom: 4 }}>{p.display_name}</h2>
            <span className="muted">{p.email} · {p.role === 'admin' ? 'Organizador' : 'Participante'} · desde {fmtDate(p.created_at)}</span>
          </div>
        </div>
        <button className="secondary" onClick={onClose} aria-label="Fechar">×</button>
      </div>

      <div className="kpis kpis-5" style={{ marginTop: 16 }}>
        <div className="kpi"><b>{p.events_started}</b>Eventos</div>
        <div className="kpi"><b>{p.races_started}</b>Corridas</div>
        <div className="kpi"><b>{Number(p.total_km).toFixed(0)}</b>km</div>
        <div className="kpi warn"><b>{p.calls}</b>Chamados</div>
      </div>

      <div className="profile-grid">
        <section>
          <h3>Contato</h3>
          {contact?.phone ? (
            <>
              <p className="big">{formatPhoneBR(contact.phone)}</p>
              <div className="row">
                <a className="btn" href={telLink(contact.phone)}>Ligar</a>
                <a className="btn secondary" href={whatsappLink(contact.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </div>
            </>
          ) : <p className="muted">Celular não informado.</p>}
          <p>Inscrição: {contact?.registration_number ?? '—'}</p>
          <p>Emergência: {contact?.emergency_phone ? `${contact.emergency_name ?? '—'} · ${contact.emergency_phone}` : '—'}</p>
          {contact?.health_notes && <p className="health">{contact.health_notes}</p>}
        </section>
        <section>
          <h3>Acesso</h3>
          <p>Último login: <b>{p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString('pt-BR') : '—'}</b></p>
          <p>Última participação: <b>{fmtDate(p.last_activity)}</b></p>
          {p.id !== me ? (
            <button className={p.role === 'admin' ? 'secondary' : ''} onClick={toggleAdmin}>{p.role === 'admin' ? 'Retirar organizador' : 'Tornar organizador →'}</button>
          ) : <p className="muted">Esta é a sua conta.</p>}
        </section>
      </div>

      {p.strava_url ? <StravaSection url={p.strava_url} activities={p.strava_km_30d != null ? strava : null} /> : null}

      <h3 style={{ marginTop: 16 }}>Participações ({history.length})</h3>
      {!history.length && <p className="muted">Nenhuma participação ainda.</p>}
      <table>
        <tbody>
          {history.map((h) => (
            <tr key={h.session_id} className={h.kind === 'official' ? 'clickable' : ''} onClick={() => { if (h.kind === 'official') location.hash = `#/evento/${h.session_id}/participantes`; }}>
              <td>{fmtDate(h.starts_at)}</td>
              <td><b>{h.name}</b> {h.is_test && <span className="badge not_started">teste</span>}</td>
              <td>{STATUS[h.status] ?? h.status}</td>
              <td>{(h.distance_m / 1000).toFixed(1)} km</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

/** Perfil Strava compartilhado com a organização; treinos só existem com a API do Strava (paga). */
function StravaSection({ url, activities }: { url: string; activities: StravaActivity[] | null }) {
  const sum = activities && stravaSummary(activities);
  return (
    <section className="strava-box">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Strava{sum ? ' · últimos 30 dias' : ''}</h3>
        <a className="btn strava" href={url} target="_blank" rel="noopener noreferrer">Ver perfil no Strava</a>
      </div>
      {activities && sum && (
        <>
          <p>{sum.count} atividade(s) a pé · <b>{sum.km} km</b> · maior {sum.longestKm} km · ritmo {sum.pace ?? '—'} min/km</p>
          <table>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.start_date).toLocaleDateString('pt-BR')}</td>
                  <td><b>{a.name ?? sportLabel(a.sport_type)}</b> <span className="muted">{sportLabel(a.sport_type)}</span></td>
                  <td>{(a.distance_m / 1000).toFixed(1)} km</td>
                  <td>{fmtDuration(a.moving_time_s)}</td>
                  <td><a className="strava-link" href={stravaActivityUrl(a.id)} target="_blank" rel="noopener noreferrer">Ver no Strava</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!activities.length && <p className="muted">Nenhuma atividade sincronizada.</p>}
          <p className="powered">Powered by <b>Strava</b></p>
        </>
      )}
    </section>
  );
}
