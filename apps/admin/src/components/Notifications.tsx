import { useEffect, useRef, useState } from 'react';
import { createStatusCache, toNotice, type Notice } from '@mb/core';
import { api, logger, supabase } from '../lib';

type Toast = Notice & { id: number; sessionId: string; at: Date };

function beep(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.connect(ctx.destination);
    o.frequency.value = urgent ? 880 : 520;
    o.start();
    o.stop(ctx.currentTime + (urgent ? 1.2 : 0.25));
  } catch { /* sem áudio */ }
}

const canNotify = typeof Notification !== 'undefined';

/** Avisos do painel inteiro: emergência, ajuda, sinal perdido e início/fim de participação. */
export function Notifications() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [permission, setPermission] = useState(canNotify ? Notification.permission : 'denied');
  const seq = useRef(0);

  useEffect(() => {
    const names = new Map<string, string>();
    let withOld = createStatusCache();
    let active = true;
    api.participantStatuses().then((rows) => active && (withOld = createStatusCache(rows))).catch((e) => logger.error('admin.notices_seed', e));

    const ch = api.subscribe('admin-notices', ['participants', 'alerts'], async (raw) => {
      const change = withOld(raw);
      const uid = change.new.user_id as string;
      if (uid && !names.has(uid)) (await api.names([uid]).catch(() => [])).forEach((p) => names.set(p.id, p.display_name));
      const n = toNotice(change, '', (id) => names.get(id) ?? 'Participante', { participation: true });
      if (!n) return;
      const toast: Toast = { ...n, id: ++seq.current, sessionId: change.new.session_id, at: new Date() };
      setToasts((t) => [toast, ...t].slice(0, 8));
      if (n.kind === 'alert') beep(Boolean(n.urgent));
      if (canNotify && Notification.permission === 'granted') new Notification(n.title, { body: n.body, tag: `${toast.id}` });
      // Emergência fica até ser fechada; o resto some sozinho.
      if (!n.urgent) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), n.kind === 'alert' ? 30_000 : 10_000);
    });
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="toasts">
      {canNotify && permission === 'default' && (
        <button onClick={async () => setPermission(await Notification.requestPermission())}>Ativar notificações</button>
      )}
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'alert' ? (t.urgent ? 'emergency' : 'help') : 'info'}`}>
          <a href={`#/evento/${t.sessionId}`}><b>{t.title}</b> · {t.at.toLocaleTimeString('pt-BR')}<br />{t.body}</a>
          <button className="secondary" aria-label="Fechar" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
