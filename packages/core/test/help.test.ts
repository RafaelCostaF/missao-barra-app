import { describe, expect, it } from 'vitest';
import { helpInbox, toNotice, unanswered } from '../src';

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

describe('caixa de atendimentos', () => {
  it('emergência aberta primeiro, depois sem resposta, depois ajuda aberta, depois encerrados', () => {
    const m = [
      { ...msg(1, 'ana', 'ana', 'Câimbra'), created_at: '2026-11-08T10:00:00Z' },
      { ...msg(2, 'bia', 'bia', 'Me perdi'), created_at: '2026-11-08T10:01:00Z' },
      { ...msg(3, 'bia', 'org', 'Fique onde está'), created_at: '2026-11-08T10:02:00Z' },
      { ...msg(4, 'edu', 'edu', 'Ok'), created_at: '2026-11-08T09:00:00Z' },
      { ...msg(5, 'edu', 'edu', 'Atendimento encerrado pelo participante.'), created_at: '2026-11-08T09:05:00Z' },
    ];
    const a = [
      { user_id: 'caio', type: 'emergency' as const, resolved_at: null, created_at: '2026-11-08T09:30:00Z' },
      { user_id: 'bia', type: 'help' as const, resolved_at: null, created_at: '2026-11-08T10:01:00Z' },
      { user_id: 'edu', type: 'help' as const, resolved_at: '2026-11-08T09:05:00Z', created_at: '2026-11-08T09:00:00Z' },
      { user_id: 'gil', type: 'signal_lost' as const, resolved_at: null, created_at: '2026-11-08T09:00:00Z' },
    ];
    const inbox = helpInbox(m, a);
    expect(inbox.map((i) => [i.user_id, i.open, i.waiting])).toEqual([['caio', 'emergency', 0], ['ana', null, 1], ['bia', 'help', 0], ['edu', null, 0]]);
    expect(inbox[2].last!.body).toBe('Fique onde está');
  });
});
