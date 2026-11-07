import { describe, expect, it } from 'vitest';
import { toNotice, type Change } from '../src';

const names: Record<string, string> = { a: 'Ana', b: 'Bia' };
const nameOf = (id: string) => names[id] ?? 'Alguém';
const ch = (table: Change['table'], eventType: Change['eventType'], n: object, o: object = {}): Change => ({ table, eventType, new: n, old: o });

describe('notificações', () => {
  it('solicitação e aceite de amizade', () => {
    expect(toNotice(ch('friendships', 'INSERT', { requester: 'a', addressee: 'b', status: 'pending' }), 'b', nameOf)?.body).toMatch(/Ana/);
    expect(toNotice(ch('friendships', 'INSERT', { requester: 'a', addressee: 'b', status: 'pending' }), 'a', nameOf)).toBeNull();
    expect(toNotice(ch('friendships', 'UPDATE', { requester: 'a', addressee: 'b', status: 'accepted' }, { status: 'pending' }), 'a', nameOf)?.kind).toBe('friend_accepted');
  });
  it('convite para corrida só para o convidado', () => {
    expect(toNotice(ch('participants', 'INSERT', { user_id: 'b', status: 'invited' }), 'b', nameOf)?.kind).toBe('invite');
    expect(toNotice(ch('participants', 'INSERT', { user_id: 'b', status: 'invited' }), 'a', nameOf)).toBeNull();
  });
  it('emergência é urgente; o próprio autor não é notificado', () => {
    const e = ch('alerts', 'INSERT', { user_id: 'a', type: 'emergency' });
    expect(toNotice(e, 'admin', nameOf)).toMatchObject({ title: 'EMERGÊNCIA', urgent: true, body: 'Ana acionou emergência.' });
    expect(toNotice(e, 'a', nameOf)).toBeNull();
    expect(toNotice(ch('alerts', 'INSERT', { user_id: 'b', type: 'signal_lost' }), 'admin', nameOf)?.urgent).toBe(false);
  });
});

describe('início/fim de participação', () => {
  const upd = (status: string, old: string) => ch('participants', 'UPDATE', { user_id: 'a', status }, { status: old });
  it('avisa quem gerencia quando alguém inicia ou finaliza', () => {
    expect(toNotice(upd('tracking', 'accepted'), 'admin', nameOf, { participation: true })).toMatchObject({ kind: 'participation', body: 'Ana começou a ser monitorado.' });
    expect(toNotice(upd('finished', 'tracking'), 'admin', nameOf, { participation: true })?.title).toBe('Finalizou');
  });
  it('não avisa sem a opção, sem mudança de status ou para a própria pessoa', () => {
    expect(toNotice(upd('tracking', 'accepted'), 'admin', nameOf)).toBeNull();
    expect(toNotice(upd('tracking', 'tracking'), 'admin', nameOf, { participation: true })).toBeNull();
    expect(toNotice(upd('tracking', 'accepted'), 'a', nameOf, { participation: true })).toBeNull();
  });
});

describe('cache de status (Realtime sem old)', async () => {
  const { createStatusCache } = await import('../src');
  const upd = (status: string, last_at = 'x'): Change => ch('participants', 'UPDATE', { session_id: 's', user_id: 'a', status, last_at });
  it('envios de posição não viram aviso; mudança de status vira', () => {
    const withOld = createStatusCache([{ session_id: 's', user_id: 'a', status: 'accepted' }]);
    const n = (c: Change) => toNotice(withOld(c), 'admin', nameOf, { participation: true });
    expect(n(upd('tracking'))?.title).toBe('Iniciou o percurso');
    expect(n(upd('tracking', 'y'))).toBeNull(); // push_positions
    expect(n(upd('finished'))?.title).toBe('Finalizou');
  });
  it('participante desconhecido não gera aviso falso', () => {
    const withOld = createStatusCache();
    expect(toNotice(withOld(upd('tracking')), 'admin', nameOf, { participation: true })).toBeNull();
    expect(toNotice(withOld(upd('finished')), 'admin', nameOf, { participation: true })?.title).toBe('Finalizou');
  });
});
