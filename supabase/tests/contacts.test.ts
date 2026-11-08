import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, pool, signUp, sys } from './helpers';

let admin: string, ana: string, bia: string;
const PHONE = `55719${String(Date.now()).slice(-8)}`; // único por execução (phone é único no Auth)
beforeAll(async () => {
  admin = await signUp('admin-ct', 'admin');
  ana = await signUp('ana-ct');
  bia = await signUp('bia-ct');
});
afterAll(() => pool.end());

describe('dados de contato', () => {
  it('a pessoa grava os próprios dados, mas o celular só entra verificado (via Auth)', async () => {
    await as(ana, (q) => q(`update profile_contacts set registration_number = 'MB-0042', emergency_name = 'Mãe', emergency_phone = '(71) 98888-0002' where user_id = $1`, [ana]));
    await expect(as(ana, (q) => q(`update profile_contacts set phone = '+5571000000000', phone_verified_at = now() where user_id = $1`, [ana]))).rejects.toThrow(/permission denied/);
    // Confirmado sem código enviado (autoconfirmação do Auth) NÃO conta como verificado.
    await sys(`update auth.users set phone = $2, phone_confirmed_at = now() where id = $1`, [ana, PHONE]);
    const [before] = await as(ana, (q) => q(`select phone from profile_contacts where user_id = $1`, [ana]));
    expect(before.phone).not.toBe(`+${PHONE}`);
    // Código SMS enviado e confirmado no Auth → telefone sincronizado como verificado.
    await sys(`update auth.users set phone = null, phone_confirmed_at = null where id = $1`, [ana]);
    await sys(`update auth.users set phone = $2, phone_change_sent_at = now(), phone_confirmed_at = now() where id = $1`, [ana, PHONE]);
    const [c] = await as(ana, (q) => q(`select phone, registration_number, phone_verified_at is not null as ok from profile_contacts where user_id = $1`, [ana]));
    expect(c).toEqual({ phone: `+${PHONE}`, registration_number: 'MB-0042', ok: true });
  });
  it('outros usuários (até amigos) não leem nem alteram', async () => {
    expect(await as(bia, (q) => q(`select * from profile_contacts where user_id = $1`, [ana]))).toHaveLength(0);
    await expect(as(bia, (q) => q(`update profile_contacts set phone = 'x' where user_id = $1`, [ana]))).rejects.toThrow(/permission denied/);
    expect(await as(bia, (q) => q(`update profile_contacts set registration_number = 'x' where user_id = $1 returning 1`, [ana]))).toHaveLength(0);
    await expect(as(bia, (q) => q(`insert into profile_contacts (user_id, registration_number) values ($1, 'x')`, [ana]))).rejects.toThrow();
  });
  it('a organização lê e corrige; updated_at acompanha', async () => {
    const [c] = await as(admin, (q) => q(`select phone from profile_contacts where user_id = $1`, [ana]));
    expect(c.phone).toBe(`+${PHONE}`);
    const [u] = await as(admin, (q) => q(`update profile_contacts set registration_number = 'MB-0043' where user_id = $1 returning registration_number, updated_at`, [ana]));
    expect(u.registration_number).toBe('MB-0043');
  });
  it('limites de tamanho', async () => {
    await expect(as(bia, (q) => q(`update profile_contacts set registration_number = $2 where user_id = $1`, [bia, '9'.repeat(41)]))).rejects.toThrow(/check/);
  });
});
