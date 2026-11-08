/** Celular brasileiro → E.164 (+55DD9XXXXXXXX). null se inválido. Aceita com/sem +55, espaços e pontuação. */
export function toE164BR(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[2] !== '9') return null; // celular: 9 após o DDD
  return `+55${d}`;
}

/** "+5571999990000" → "(71) 99999-0000" */
export function formatPhoneBR(e164: string | null | undefined): string {
  const d = (e164 ?? '').replace(/\D/g, '').replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : e164 ?? '';
}

/** Senha: mínimo 8 caracteres, com letras e números (espelha a política do Supabase Auth). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Use letras e números.';
  return null;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** Máscara enquanto digita (DDD + número): "7133334444" → "(71) 3333-4444", "71999990000" → "(71) 99999-0000". Ignora +55 colado. */
export function maskPhoneBR(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone com DDD (fixo ou celular), para contato de emergência. */
export const isPhoneBR = (s: string) => /^[1-9][0-9]\d{8,9}$/.test(s.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''));

/** O que falta para iniciar evento oficial (mesma regra do banco, `profile_complete`: foto + celular). */
export function profileMissing(c: { phone?: string | null; photo_path?: string | null } | null): ('foto' | 'celular')[] {
  const missing: ('foto' | 'celular')[] = [];
  if (!c?.photo_path) missing.push('foto');
  if (!c?.phone) missing.push('celular');
  return missing;
}
