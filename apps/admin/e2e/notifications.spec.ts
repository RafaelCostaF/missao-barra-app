import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createApi } from '@mb/core';

const URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

// Um participante real (outro "aparelho") inicia, pede ajuda, aciona emergência e finaliza; o painel avisa cada passo.
test('painel avisa início, ajuda, emergência e fim de participação', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText('Missão Barra · Painel')).toBeVisible();
  await page.waitForTimeout(3000); // assinatura do Realtime ativa

  const p = createApi(createClient(URL, ANON, { auth: { persistSession: false } }));
  await p.signUp(`notif-${Date.now()}@teste.dev`, 'senha-forte-123', 'Ana Notificação');
  const ev = (await p.publishedEvents()).find((e) => e.status === 'live')!;
  await p.joinEvent(ev.id);

  const toast = (title: string) => page.locator('.toast', { hasText: title }).filter({ hasText: 'Ana Notificação' });
  await p.startTracking(ev.id);
  await expect(toast('Iniciou o percurso')).toBeVisible({ timeout: 15_000 });
  await p.pushPositions(ev.id, [{ lat: -12.96, lng: -38.37, accuracy: 5, recordedAt: new Date().toISOString() }], 0);
  await p.raiseAlert(ev.id, 'help');
  await expect(toast('Pedido de ajuda')).toBeVisible({ timeout: 15_000 });
  await p.raiseAlert(ev.id, 'emergency');
  await expect(toast('EMERGÊNCIA')).toBeVisible({ timeout: 15_000 });
  await p.finish(ev.id);
  await expect(toast('Finalizou')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.toast', { hasText: 'Iniciou o percurso' })).toHaveCount(1); // posição enviada não repete aviso
  await page.screenshot({ path: 'e2e/screenshots/05-notificacoes.png' });
});
