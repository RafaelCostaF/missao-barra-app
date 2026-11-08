import { useEffect, useState } from 'react';
import { fmtDuration, type Alert, type Passage } from '@mb/core';
import { api } from '../lib';
import { ALERT_LABEL } from './AlertCenter';

export const EVENT_LABEL: Record<string, string> = {
  invited: 'Convidado', accepted: 'Entrou', declined: 'Recusou', tracking: 'Iniciou o percurso', finished: 'Finalizou',
  sharing_on: 'Ligou o compartilhamento', sharing_off: 'Desligou o compartilhamento',
};

/** Auditoria de uma pessoa: status, passagens e chamados em ordem cronológica. */
export function Timeline({ sessionId, userId, passages, alerts }: { sessionId: string; userId: string; passages: Passage[]; alerts: Alert[] }) {
  const [events, setEvents] = useState<{ event: string; actor: string | null; at: string }[]>([]);
  useEffect(() => void api.timeline(sessionId, userId).then(setEvents).catch(() => undefined), [sessionId, userId]);

  const items = [
    ...events.map((e) => ({ at: e.at, kind: 'status', text: EVENT_LABEL[e.event] ?? e.event, note: e.actor && e.actor !== userId ? 'pela organização' : '' })),
    ...passages.map((p) => ({ at: p.at, kind: 'passage', text: `Passou por ${p.name} (km ${p.km})`, note: `+${fmtDuration(p.elapsed_s)}` })),
    ...alerts.flatMap((a) => [
      { at: a.created_at, kind: `ev-alert ${a.type}`, text: ALERT_LABEL[a.type], note: '' },
      ...(a.resolved_at ? [{ at: a.resolved_at, kind: 'resolved', text: `${ALERT_LABEL[a.type]} resolvido`, note: `em ${fmtDuration((Date.parse(a.resolved_at) - Date.parse(a.created_at)) / 1000)}` }] : []),
    ]),
  ].sort((a, b) => a.at.localeCompare(b.at));

  if (!items.length) return <p className="muted">Sem registros ainda.</p>;
  return (
    <ol className="timeline">
      {items.map((i, n) => (
        <li key={n} className={i.kind}>
          <span className="muted">{new Date(i.at).toLocaleTimeString('pt-BR')}</span> {i.text} {i.note && <span className="muted">· {i.note}</span>}
        </li>
      ))}
    </ol>
  );
}
