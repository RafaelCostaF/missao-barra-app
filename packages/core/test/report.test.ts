import { describe, expect, it } from 'vitest';
import { summarize, toCsv } from '../src';

describe('resumo do evento', () => {
  it('conta ativos, desatualizados, finalizados e emergências abertas', () => {
    const now = Date.parse('2026-12-06T10:00:00Z');
    const r = summarize(
      [
        { status: 'tracking', last_at: '2026-12-06T09:59:40Z' },
        { status: 'tracking', last_at: '2026-12-06T09:50:00Z' },
        { status: 'finished', last_at: '2026-12-06T09:00:00Z' },
        { status: 'accepted', last_at: null },
      ],
      [{ type: 'emergency', resolved_at: null }, { type: 'help', resolved_at: '2026-12-06T09:00:00Z' }, { type: 'signal_lost', resolved_at: null }],
      now,
    );
    expect(r).toEqual({ tracking: 1, stale: 1, finished: 1, not_started: 1, total: 4, openAlerts: 2, emergencies: 1 });
  });
});

describe('toCsv', () => {
  it('escapa vírgulas, aspas, quebras e objetos', () => {
    expect(toCsv([{ a: 'x,y', b: 'diz "oi"' }, { a: 'l1\nl2', c: { k: 1 } }])).toBe(
      'a,b,c\n"x,y","diz ""oi""",\n"l1\nl2",,"{""k"":1}"',
    );
    expect(toCsv([])).toBe('');
  });
});

describe('ciclo de vida do evento', async () => {
  const { SESSION_ACTIONS } = await import('../src');
  it('segue rascunho → publicado → ao vivo → encerrado → arquivado', () => {
    let s: keyof typeof SESSION_ACTIONS = 'draft';
    const path = [s];
    while (SESSION_ACTIONS[s].length) path.push((s = SESSION_ACTIONS[s][0].to));
    expect(path).toEqual(['draft', 'published', 'live', 'ended', 'archived']);
  });
});
