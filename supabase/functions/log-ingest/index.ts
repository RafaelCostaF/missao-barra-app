// Recebe lotes de logs do app/painel e grava em app_logs com service role.
import { createClient } from '@supabase/supabase-js';
import { toRows } from './rows.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// O painel web chama do navegador (outra origem): sem CORS o preflight falha e os logs se perdem.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const res = await handle(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  // Exige usuário autenticado (anon key + JWT) para evitar spam anônimo.
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt || (await admin.auth.getUser(jwt)).error) return new Response('unauthorized', { status: 401 });

  const rows = toRows(await req.json().catch(() => null));
  if (!rows) return new Response('expected array', { status: 400 });

  const { error } = await admin.from('app_logs').insert(rows);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ inserted: rows.length });
}
