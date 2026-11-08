import { describe, expect, it } from 'vitest';
import { formatPhoneBR, isPhoneBR, maskPhoneBR, isEmail, passwordProblem, profileMissing, toE164BR } from '../src';

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
    expect(profileMissing(null)).toEqual(['foto', 'celular']);
    expect(profileMissing({ photo_path: 'x', phone: '+5571999990000' })).toEqual([]);
  });
  it('máscara do celular enquanto digita', () => {
    expect(['', '7', '71', '719', '7199999', '7133334444', '71999990000', '719999900001', '+55 71 99999-0000'].map(maskPhoneBR))
      .toEqual(['', '(7', '(71', '(71) 9', '(71) 9999-9', '(71) 3333-4444', '(71) 99999-0000', '(71) 99999-0000', '(71) 99999-0000']);
    expect(['(71) 3333-4444', '(71) 99999-0000', '+55 71 99999-0000', '3333-4444', '(01) 99999-0000'].map(isPhoneBR)).toEqual([true, true, true, false, false]);
  });
});
