import { useEffect, useMemo, useState } from 'react';
import {
  classifyPeople, formatPhoneBR, getSignalState, LOW_BATTERY, mapsLink, matchesPerson, PERSON_FILTERS, SIGNAL_LABEL, telLink, toCsv, whatsappLink,
  type Alert, type Checkpoint, type Contact, type LiveParticipant, type ParticipantSummary, type Person, type PersonFilter,
} from '@mb/core';
import { api, download, fmtTime, run } from '../lib';
import { Modal } from './Modal';
import { Timeline } from './Timeline';

const ago = (iso: string | null, now: number) => {
  if (!iso) return '—';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};
// Ordem de prioridade para quem precisa de contato aparecer primeiro.
const PRIORITY: PersonFilter[] = ['open_call', 'stale', 'off_route', 'low_battery', 'not_completed', 'not_started', 'tracking', 'completed'];
const rank = (p: Person) => { const i = PRIORITY.findIndex((f) => p.flags.has(f)); return i < 0 ? 99 : i; };

/** Rastreio um a um: filtros por situação, busca e perfil com contato. */
export function PeopleTab({ sessionId, participants, alerts, checkpoints, now, onChanged }: {
  sessionId: string; participants: LiveParticipant[]; alerts: Alert[]; checkpoints: Checkpoint[]; now: number; onChanged: () => void;
}) {
  const [report, setReport] = useState<ParticipantSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<PersonFilter>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const ids = participants.map((p) => p.user_id).sort().join(',');

  useEffect(() => {
    const load = () => api.report(sessionId).then(setReport).catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000); // passagens mudam devagar
    return () => clearInterval(t);
  }, [sessionId]);
  useEffect(() => void api.contacts(ids ? ids.split(',') : []).then(setContacts).catch(() => undefined), [ids]);

  const people = useMemo(() => classifyPeople(participants, report, alerts, checkpoints, contacts, now), [participants, report, alerts, checkpoints, contacts, now]);
  const counts = Object.fromEntries((Object.keys(PERSON_FILTERS) as PersonFilter[]).map((f) => [f, people.filter((p) => p.flags.has(f)).length]));
  const shown = people.filter((p) => p.flags.has(filter) && matchesPerson(p, q)).sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name));
  const person = people.find((p) => p.user_id === selected);

  return (
    <div className="fade-in" style={{ display: 'grid', gap: 12 }}>
      <div className="row">
        <input className="search" placeholder="Buscar por nome, nº de inscrição ou celular" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="secondary" onClick={() => download(`participantes-${sessionId}.csv`, toCsv(shown.map((p) => ({
          nome: p.display_name, inscricao: p.contact?.registration_number, celular: p.contact?.phone, situacao: [...p.flags].filter((f) => f !== 'all').map((f) => PERSON_FILTERS[f]).join(' | '),
          ultima_posicao: p.last_at, bateria: p.battery, lat: p.last_lat, lng: p.last_lng, km: (p.distance_m / 1000).toFixed(1), pontos: p.passed,
          contato_emergencia: p.contact?.emergency_name, tel_emergencia: p.contact?.emergency_phone,
        }))))}>CSV</button>
      </div>
      <div className="chips">
        {(Object.keys(PERSON_FILTERS) as PersonFilter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''} ${['open_call', 'stale', 'off_route', 'low_battery'].includes(f) && counts[f] ? 'hot' : ''}`} onClick={() => setFilter(f)}>
            {PERSON_FILTERS[f]} <b>{counts[f]}</b>
          </button>
        ))}
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Nome</th><th className="hide-sm">Inscrição</th><th>Situação</th><th>Última posição</th><th className="hide-sm">Bateria</th><th className="hide-sm">km</th><th className="hide-sm">Pontos</th><th>Contato</th></tr></thead>
          <tbody>
            {shown.map((p) => {
              const s = getSignalState(p as never, now);
              return (
                <tr key={p.user_id} className="clickable" onClick={() => setSelected(p.user_id)}>
                  <td><b>{p.display_name}</b></td>
                  <td className="hide-sm">{p.contact?.registration_number ?? '—'}</td>
                  <td className="flags">
                    <span className={`badge ${s}`}>{SIGNAL_LABEL[s]}</span>
                    {p.flags.has('open_call') && <span className="badge alert-emergency">Chamado</span>}
                    {p.flags.has('off_route') && <span className="badge alert-help">Fora do percurso</span>}
                    {p.flags.has('low_battery') && <span className="badge alert-help">Bateria {p.battery}%</span>}
                    {p.flags.has('not_completed') && <span className="badge not_started">Não concluiu</span>}
                  </td>
                  <td>{ago(p.last_at, now)}</td>
                  <td className="hide-sm">{p.battery != null ? `${p.battery}%` : '—'}</td>
                  <td className="hide-sm">{(p.distance_m / 1000).toFixed(1)}</td>
                  <td className="hide-sm">{p.passed}/{checkpoints.length}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {p.contact?.phone ? <a className="icon-link" href={whatsappLink(p.contact.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp">WhatsApp</a> : <span className="muted">sem celular</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <p className="muted">Ninguém nesta situação.</p>}
      </div>
      {person && <PersonModal sessionId={sessionId} person={person} alerts={alerts.filter((a) => a.user_id === person.user_id)} report={report.find((r) => r.user_id === person.user_id)} now={now} onClose={() => setSelected(null)} onChanged={onChanged} />}
    </div>
  );
}

function PersonModal({ sessionId, person: p, alerts, report, now, onClose, onChanged }: {
  sessionId: string; person: Person; alerts: Alert[]; report?: ParticipantSummary; now: number; onClose: () => void; onChanged: () => void;
}) {
  const s = getSignalState(p as never, now);
  const c = p.contact;
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (c?.photo_path) void api.photoUrl(c.photo_path).then(setPhoto).catch(() => setPhoto(null));
  }, [c?.photo_path]);

  async function finishForThem() {
    if (!confirm(`Finalizar a participação de ${p.display_name}? Use em desistência ou quando a pessoa avisar que encerrou.`)) return;
    await run('admin.finish_for', () => api.finishFor(sessionId, p.user_id), { session_id: sessionId });
    onChanged();
  }
  return (
    <Modal label={`Perfil de ${p.display_name}`} onClose={onClose}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 14 }}>
            {photo ? <img className="avatar" src={photo} alt={`Foto de ${p.display_name}`} /> : <div className="avatar empty" aria-label="Sem foto">?</div>}
            <div>
              <h2 style={{ marginBottom: 4 }}>{p.display_name}</h2>
              <span className="muted">Inscrição {c?.registration_number ?? 'não informada'}</span>
            </div>
          </div>
          <button className="secondary" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="profile-grid">
          <section>
            <h3>Contato</h3>
            {c?.phone ? (
              <>
                <p className="big">{formatPhoneBR(c.phone)} {c.phone_verified_at ? <span className="badge tracking" title="Confirmado por SMS">verificado</span> : <span className="badge not_started">não verificado</span>}</p>
                <div className="row">
                  <a className="btn" href={telLink(c.phone)}>Ligar</a>
                  <a className="btn secondary" href={whatsappLink(c.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
              </>
            ) : <p className="muted">Celular não informado.</p>}
            <h3 style={{ marginTop: 16 }}>Contato de emergência</h3>
            {c?.emergency_phone ? (
              <div className="row"><span>{c.emergency_name ?? '—'} · {c.emergency_phone}</span><a className="btn secondary" href={telLink(c.emergency_phone)}>Ligar</a></div>
            ) : <p className="muted">Não informado.</p>}
            {c?.health_notes && (<><h3 style={{ marginTop: 16 }}>Saúde</h3><p className="health">{c.health_notes}</p></>)}
          </section>
          <section>
            <h3>Agora</h3>
            <p><span className={`badge ${s}`}>{SIGNAL_LABEL[s]}</span></p>
            <p>Última posição: <b>{fmtTime(p.last_at)}</b> <span className="muted">({ago(p.last_at, now)})</span></p>
            <p>{(p.distance_m / 1000).toFixed(1)} km · {p.passed} ponto(s) de apoio</p>
            <p>Bateria: <b className={p.battery != null && p.battery <= LOW_BATTERY ? 'low' : ''}>{p.battery != null ? `${p.battery}%` : 'sem informação'}</b></p>
            <div className="row">
              {p.last_lat != null && <a className="btn secondary" href={mapsLink(p.last_lat, p.last_lng!)} target="_blank" rel="noopener noreferrer">Abrir posição no mapa</a>}
              {p.status === 'tracking' && <button className="secondary" onClick={finishForThem}>Finalizar participação</button>}
            </div>
          </section>
        </div>

        <h3 style={{ marginTop: 16 }}>Linha do tempo</h3>
        <Timeline sessionId={sessionId} userId={p.user_id} passages={report?.passages ?? []} alerts={alerts} />
    </Modal>
  );
}
