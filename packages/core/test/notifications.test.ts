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
