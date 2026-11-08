// Cadastro seguro contra o Supabase completo (Auth + Storage + SMS de teste). Rodar: npm run test:realtime
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { createApi, profileMissing, toE164BR } from '@mb/core';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const ANON = process.env.SUPABASE_ANON_KEY!;
const db = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' });
const run = Date.now().toString(36);
const TEST_PHONE = toE164BR('(71) 90000-0001')!; // número de teste do config.toml (código 123456)
// Imagem JPEG mínima (1×1) para o upload.
const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z'), (c) => c.charCodeAt(0)).buffer;

const client = () => createApi(createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } }));
let ana: ReturnType<typeof client>, bia: ReturnType<typeof client>, admin: ReturnType<typeof client>;

beforeAll(async () => {
  await db.query(`update auth.users set phone = null where phone = $1`, [TEST_PHONE.slice(1)]); // libera o número de teste
  [ana, bia, admin] = [client(), client(), client()];
  await ana.signUp(`ana-${run}@teste.dev`, 'senha-forte-123', 'Ana Cadastro');
  await bia.signUp(`bia-${run}@teste.dev`, 'senha-forte-123', 'Bia Cadastro');
  await admin.signUp(`adm-${run}@teste.dev`, 'senha-forte-123', 'Admin Cadastro');
  await db.query(`update profiles set role = 'admin' where id = $1`, [await admin.me()]);
});
afterAll(() => db.end());

describe('cadastro seguro', () => {
  it('recusa senha fraca (política do Auth)', async () => {
    await expect(client().signUp(`fraca-${run}@teste.dev`, 'abcdefgh', 'Fraca')).rejects.toThrow();
    await expect(client().signUp(`curta-${run}@teste.dev`, 'ab12', 'Curta')).rejects.toThrow();
  });

  it('verifica o celular por código SMS (número de teste)', async () => {
    expect(profileMissing(await ana.myContact())).toEqual(['foto', 'celular']);
    await ana.requestPhoneCode(TEST_PHONE);
    await expect(ana.confirmPhoneCode(TEST_PHONE, '000000')).rejects.toThrow();
    await ana.confirmPhoneCode(TEST_PHONE, '123456');
    const c = await ana.myContact();
    expect(c?.phone).toBe(TEST_PHONE);
    expect(c?.phone_verified_at).toBeTruthy();
  });

  it('foto em bucket privado: dono e organização veem; outros não', async () => {
    const path = await ana.uploadPhoto(JPEG);
    await ana.saveMyContact({ photo_path: path });
    expect(profileMissing(await ana.myContact())).toEqual([]);
    expect(await (await fetch(await ana.photoUrl(path))).arrayBuffer()).toHaveProperty('byteLength', JPEG.byteLength);
    expect(await admin.photoUrl(path)).toMatch(/token=/);
    await expect(bia.photoUrl(path)).rejects.toThrow();
    const anaId = await ana.me();
    const bad = await createClient(URL, ANON, { auth: { persistSession: false } });
    void bad;
    // bia não grava na pasta da ana
    const biaDb = createClient(URL, ANON, { auth: { persistSession: false } });
    await biaDb.auth.signInWithPassword({ email: `bia-${run}@teste.dev`, password: 'senha-forte-123' });
    const { error } = await biaDb.storage.from('avatars').upload(`${anaId}/x.jpg`, JPEG, { contentType: 'image/jpeg' });
    expect(error).toBeTruthy();
  });

  it('cadastro completo libera iniciar evento oficial; incompleto é barrado', async () => {
    const ev = (await admin.saveEvent({ name: `Cadastro ${run}`, is_test: true, status: 'live' })).id;
    await ana.joinEvent(ev);
    await ana.startTracking(ev);
    await bia.joinEvent(ev);
    await expect(bia.startTracking(ev)).rejects.toThrow(/profile incomplete/);
  });
});
