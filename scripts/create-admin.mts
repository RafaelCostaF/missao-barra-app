/**
 * Cria (ou promove) a conta de administrador padrão da organização.
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/create-admin.mts --email organizacao@exemplo.com [--password …] [--name "Organização"]
 * Sem --password, gera uma senha forte e a imprime uma única vez.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { passwordProblem } from '@mb/core';

const { values: a } = parseArgs({ options: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string', default: 'Organização' } } });
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
if (!a.email || !url || !service) throw new Error('Informe --email e SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
const password = a.password ?? `${randomBytes(9).toString('base64url')}9a`;
const problem = passwordProblem(password);
if (problem) throw new Error(`Senha fraca: ${problem}`);

const sa = createClient(url, service, { auth: { persistSession: false } });
const created = await sa.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { display_name: a.name } });
let id = created.data.user?.id;
if (!id) {
  // Já existe: só promove (a senha não é alterada).
  const { data } = await sa.auth.admin.listUsers({ perPage: 1000 });
  id = data.users.find((u) => u.email?.toLowerCase() === a.email!.toLowerCase())?.id;
  if (!id) throw new Error(created.error?.message ?? 'não foi possível criar a conta');
}
const { error } = await sa.from('profiles').update({ role: 'admin' }).eq('id', id);
if (error) throw error;
console.log(JSON.stringify({ admin: a.email, ...(created.data.user && { password }), note: created.data.user ? 'guarde a senha; ela não será mostrada de novo' : 'conta existente promovida a admin' }));
