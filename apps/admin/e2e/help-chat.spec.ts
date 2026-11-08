import { expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

test('ajuda por conversa: participante escreve, painel mostra 💬 e a resposta chega a ele', async ({ page }) => {
  const NAME = `Chat ${Date.now().toString().slice(-6)}`;
  const p = await testParticipant(NAME);
  const ev = (await p.publishedEvents()).find((e) => e.status === 'live')!;
  await p.joinEvent(ev.id);
  await p.startTracking(ev.id);
  const me = await p.me();
  await p.sendHelp(ev.id, me, 'Câimbra');

  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.goto(`/#/evento/${ev.id}/participantes`);
  const row = page.locator('tr.clickable', { hasText: NAME });
  await expect(row.locator('.chat-badge')).toHaveText('💬 1');
  await row.click();
  const dialog = page.getByRole('dialog', { name: /Perfil de/ });
  await expect(dialog.locator('.bubble.theirs')).toContainText('Câimbra');
  await dialog.getByRole('button', { name: 'Equipe a caminho' }).click();
  await expect(dialog.locator('.bubble.mine')).toContainText('Equipe a caminho');
  await page.screenshot({ path: 'e2e/screenshots/14-conversa-ajuda.png' });
  await expect(row.locator('.chat-badge')).toHaveCount(0); // respondida

  const thread = await p.helpThread(ev.id, me);
  expect(thread.map((m) => m.body)).toEqual(['Câimbra', 'Equipe a caminho']);
  expect((await p.alerts(ev.id)).filter((a) => a.user_id === me && a.type === 'help' && !a.resolved_at)).toHaveLength(1);
});
