import { describe, expect, it } from 'vitest';
import {
  buildShareScene, buildTrack, downsample, projectTracks, replayFrames, shareDate, shareFileName, shareStats, summarizeTrack, toGPX, trackRowsToFixes,
  type Fix,
} from '../src';

const T0 = Date.parse('2026-12-13T08:00:00Z');
const LAT = -12.957, LNG = -38.3537;
const west = (m: number) => LNG - m / 108_500;
/** Corrida reta para oeste a `paceS` s/km, um fix a cada 20 s. */
const run = (paceS: number, seconds: number): Fix[] =>
  Array.from({ length: seconds / 20 + 1 }, (_, i) => ({ lat: LAT, lng: west(((i * 20) / paceS) * 1000), accuracy: 6, recordedAt: new Date(T0 + i * 20_000).toISOString() }));

describe('compartilhar corrida', () => {
  it('trilha descarta imprecisos, fora de ordem e acumula distância', () => {
    const fixes = run(360, 600);
    const noisy = [...fixes, { ...fixes[3], accuracy: 80, lat: 0 }, { ...fixes[5] }].reverse();
    const tr = buildTrack(noisy);
    expect(tr).toHaveLength(fixes.length);
    expect(tr[0].d).toBe(0);
    expect(Math.abs(tr.at(-1)!.d - 1667)).toBeLessThan(30);
    expect(trackRowsToFixes([[LAT, LNG, null, T0]])[0]).toEqual({ lat: LAT, lng: LNG, accuracy: 0, recordedAt: new Date(T0).toISOString() });
  });

  it('resumo usa números oficiais quando houver, senão a trilha', () => {
    const tr = buildTrack(run(360, 1500));
    const own = summarizeTrack(tr);
    expect(own.elapsedS).toBe(1500);
    expect(own.splits).toHaveLength(4);
    const off = summarizeTrack(tr, { distanceM: 5000, startedAt: new Date(T0).toISOString(), endedAt: new Date(T0 + 1800_000).toISOString() });
    expect(off.distanceM).toBe(5000);
    expect(off.paceS).toBe(360);
    const stats = shareStats(off);
    expect(stats.slice(0, 3)).toEqual([
      { label: 'Distância', value: '5,00', unit: 'km' },
      { label: 'Tempo', value: '30:00' },
      { label: 'Pace médio', value: '6:00', unit: '/km' },
    ]);
    expect(stats.some((s) => s.label === 'Melhor km')).toBe(true);
    expect(summarizeTrack([]).distanceM).toBe(0);
  });

  it('projeção norte para cima na caixa unitária, proporção preservada', () => {
    const p = projectTracks([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }], [{ lat: 0.005, lng: 0 }]);
    expect(p.ax).toBe(1);
    expect(p.ay).toBeCloseTo(0.4967, 2);
    expect(p.main[0]).toEqual([0, p.ay]); // sul fica embaixo
    expect(p.extra[0]).toEqual([0, 0]);
    expect(projectTracks([]).main).toEqual([]);
    expect(downsample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
  });

  it('quadros do vídeo: começam no início, terminam no fim, horário real e pace', () => {
    const tr = buildTrack(run(360, 1500));
    const fr = replayFrames(tr, 60, (ms) => new Date(ms).toISOString().slice(11, 16));
    expect(fr).toHaveLength(60);
    expect(fr[0]).toMatchObject({ i: 0, clock: '08:00', elapsed: '0:00', km: '0,00' });
    expect(fr.at(-1)).toMatchObject({ i: tr.length - 1, clock: '08:25', elapsed: '25:00' });
    expect(fr[40].pace).toMatch(/^(5:5\d|6:0\d)$/);
    for (let k = 1; k < fr.length; k++) expect(fr[k].i).toBeGreaterThanOrEqual(fr[k - 1].i);
    expect(replayFrames(tr.slice(0, 1), 60)).toEqual([]);
  });

  it('cena com trilha reduzida e quadros reescalados', () => {
    const tr = buildTrack(run(300, 6000)); // 301 pontos
    const s = buildShareScene({ track: tr, summary: summarizeTrack(tr), title: 'Missão Barra', name: 'Ana', layout: 'farol', format: 'story', photo: true, frameCount: 30 });
    expect(s.w).toBe(1080);
    expect(s.h).toBe(1920);
    expect(s.track.length).toBe(301);
    expect(s.frames.at(-1)!.i).toBe(300);
    const long = buildTrack(run(300, 30000)); // 1501 pontos → 600
    const s2 = buildShareScene({ track: long, summary: summarizeTrack(long), title: 'x', name: '', layout: 'mapa', format: 'post', photo: false, frameCount: 10 });
    expect(s2.track.length).toBe(600);
    expect(s2.frames.at(-1)!.i).toBe(599);
    expect(s2.h).toBe(1350);
  });

  it('GPX com horários e nome escapado; nome de arquivo e data em pt-BR', () => {
    const tr = buildTrack(run(360, 60));
    const gpx = toGPX(tr, 'Missão <Barra> & amigos');
    expect(gpx).toContain('<name>Missão &lt;Barra&gt; &amp; amigos</name>');
    expect(gpx.match(/<trkpt /g)).toHaveLength(4);
    expect(gpx).toContain(`<time>${new Date(T0).toISOString()}</time>`);
    expect(shareFileName('Missão Barra — 6ª edição!', T0, 'gpx')).toBe('missao-barra-6a-edicao-2026-12-13.gpx');
    expect(shareFileName('***', null, 'png')).toBe('corrida.png');
    expect(shareDate(new Date(2026, 11, 13, 5, 7).getTime())).toBe('13 de dezembro de 2026 · 05:07');
  });
});
