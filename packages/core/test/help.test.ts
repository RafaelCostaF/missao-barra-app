import { describe, expect, it } from 'vitest';
import { toNotice, unanswered } from '../src';

const msg = (id: number, user_id: string, sender_id: string, body = 'x') => ({ id, user_id, sender_id, body, created_at: '' });

describe('ajuda por conversa', () => {
  it('conta mensagens sem resposta por participante', () => {
    const m = [msg(1, 'ana', 'ana'), msg(2, 'ana', 'org'), msg(3, 'ana', 'ana'), msg(4, 'ana', 'ana'), msg(5, 'bia', 'bia'), msg(6, 'bia', 'org')];
    expect([...unanswered(m)]).toEqual([['ana', 2]]);
  });
  it('avisos: participante recebe resposta; organização recebe mensagem do participante; ninguém é avisado da própria', () => {
    const ch = (n: object) => ({ table: 'help_messages' as const, eventType: 'INSERT' as const, new: n, old: {} });
    const name = () => 'Ana';
    expect(toNotice(ch(msg(1, 'ana', 'org', 'Equipe a caminho')), 'ana', name)).toMatchObject({ title: 'Organização respondeu', body: 'Equipe a caminho' });
    expect(toNotice(ch(msg(2, 'ana', 'ana', 'Câimbra')), 'org', name)).toMatchObject({ title: 'Ana (ajuda)', body: 'Câimbra' });
    expect(toNotice(ch(msg(3, 'ana', 'ana')), 'ana', name)).toBeNull();
    expect(toNotice(ch(msg(4, 'ana', 'org2')), 'org', name)).toBeNull(); // resposta de outro organizador
  });
});
