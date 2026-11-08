import { describe, expect, it } from 'vitest';
import { formatPhoneBR, isEmail, passwordProblem, profileMissing, toE164BR } from '../src';

describe('validação de cadastro', () => {
  it('celular brasileiro em E.164', () => {
    expect(toE164BR('(71) 99999-0000')).toBe('+5571999990000');
    expect(toE164BR('+55 71 9 9999 0000')).toBe('+5571999990000');
    expect(toE164BR('71 3333-0000')).toBeNull(); // fixo
    expect(toE164BR('(05) 99999-0000')).toBeNull(); // DDD inválido
    expect(toE164BR('99999-0000')).toBeNull(); // sem DDD
    expect(formatPhoneBR('+5571999990000')).toBe('(71) 99999-0000');
  });
  it('senha forte', () => {
    expect(passwordProblem('abc123')).toMatch(/8/);
    expect(passwordProblem('abcdefgh')).toMatch(/números/);
    expect(passwordProblem('missao2026')).toBeNull();
  });
  it('e-mail e cadastro completo', () => {
    expect(isEmail('ana@missaobarra.com.br')).toBe(true);
    expect(isEmail('ana@')).toBe(false);
    expect(profileMissing(null)).toEqual(['foto', 'celular verificado']);
    expect(profileMissing({ photo_path: 'x', phone_verified_at: '2026-01-01' })).toEqual([]);
  });
});
