/**
 * Limpa os dados do vídeo. Sem flag: só os eventos de teste do vídeo (para regravar).
 * --all: também o elenco video-*@teste.dev (alertas deles primeiro, depois as contas) e as fotos.
 *   npx tsx .claude/skills/video-demo/scripts/cleanup.mts [--all]
 */
import { createClient } from '@supabase/supabase-js';

const sa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: evs } = await sa.from('sessions').select('id').eq('is_test', true).eq('name', 'Missão Barra — 6ª edição');
for (const e of evs ?? []) await sa.from('sessions').delete().eq('id', e.id).eq('is_test', true);
console.log('eventos do vídeo apagados:', evs?.length ?? 0);
if (process.argv.includes('--all')) {
  const users = (await sa.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => /^video-.*@teste\.dev$/.test(u.email ?? ''));
  for (const u of users) {
    await sa.from('alerts').delete().eq('user_id', u.id);
    const files = (await sa.storage.from('avatars').list(u.id)).data ?? [];
    if (files.length) await sa.storage.from('avatars').remove(files.map((f) => `${u.id}/${f.name}`));
    await sa.auth.admin.deleteUser(u.id);
  }
  console.log('contas do elenco apagadas:', users.length);
}
