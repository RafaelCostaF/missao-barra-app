/** Formatação pt-BR para textos de tela. */

/** Metros → "4,6" (km com vírgula). */
export const kmBR = (m: number, digits = 1) => (m / 1000).toFixed(digits).replace('.', ',');

/** "1 mensagem" / "3 mensagens" (sem "mensagem(ns)"). */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Duração curta para estimativas: "<1 min", "12 min", "2 h 05". */
export function dur(s: number) {
  const min = Math.round(s / 60);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** Estimativa: "~12 min", ou "menos de 1 min" (sem "~"). */
export const about = (s: number) => (s < 30 ? dur(s) : `~${dur(s)}`);
