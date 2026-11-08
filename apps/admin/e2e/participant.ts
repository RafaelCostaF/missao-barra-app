import { createClient } from '@supabase/supabase-js';
import { createApi } from '@mb/core';

const URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!; // só nos testes: completa o cadastro de contas fictícias

/** Participante de teste (outro "aparelho") com cadastro completo; e-mail @teste.dev para limpeza posterior. */
export async function testParticipant(name: string, contact: { phone?: string; registration_number?: string; emergency_name?: string; emergency_phone?: string; health_notes?: string } = {}) {
  const p = createApi(createClient(URL, ANON, { auth: { persistSession: false } }));
  const email = `${name.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}-${Date.now()}@teste.dev`;
  await p.signUp(email, 'senha-forte-123', name);
  const sa = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { error } = await sa.from('profile_contacts').upsert({ user_id: await p.me(), phone_verified_at: new Date().toISOString(), photo_path: 'teste', phone: contact.phone ?? '+5571900000009', ...contact });
  if (error) throw error;
  return Object.assign(p, { email });
}
