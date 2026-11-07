import pg from 'pg';
import { randomUUID } from 'node:crypto';

export const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54329/postgres',
});

type Query = <R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<R[]>;

/** Executa como usuário autenticado (igual ao PostgREST: role + JWT claims), numa transação. */
export async function as<T>(userId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    // Os dois formatos: auth.uid() antigo lê claim.sub, o atual lê claims->>'sub'.
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
      userId,
    ]);
    await c.query('set local role authenticated');
    const out = await fn(async (sql, params) => (await c.query(sql, params)).rows);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

/** Como superusuário (service role / jobs agendados). */
export const sys: Query = async (sql, params) => (await pool.query(sql, params)).rows;

/** Simula um cadastro no Supabase Auth; o trigger cria o perfil. */
export async function signUp(name: string, role: 'user' | 'admin' = 'user'): Promise<string> {
  const id = randomUUID();
  await sys(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id, `${name}-${id.slice(0, 8)}@teste.dev`, { display_name: name },
  ]);
  if (role === 'admin') await sys(`update profiles set role = 'admin' where id = $1`, [id]);
  return id;
}

/** Fix de GPS simulado ao longo da orla (deslocamento em metros para oeste a partir do Farol de Itapuã). */
export function fix(metersWest: number, secondsAgo = 0, accuracy = 8) {
  return {
    lat: -12.9570655,
    lng: -38.3536886 - metersWest / 108_000,
    accuracy,
    recordedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
  };
}
