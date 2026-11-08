import { expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

test('atendimentos: conversa em tela própria, resposta, encerrar e perfil só por clique', async ({ page }) => {
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
  // Lista de participantes: 💬 leva ao atendimento (não ao perfil).
  await page.goto(`/#/evento/${ev.id}/participantes`);
  const row = page.locator('tr.clickable', { hasText: NAME });
  await expect(row.locator('.chat-badge')).toHaveText('💬 1');
  await row.locator('.chat-badge').click();
  await expect(page).toHaveURL(new RegExp(`atendimentos/${me}`));
  await expect(page.getByRole('dialog')).toHaveCount(0); // perfil só se clicar em "Ver perfil"

  const item = page.locator('.inbox-item', { hasText: NAME });
  await expect(item).toContainText('Ajuda aberta');
  await expect(item).toContainText('1 sem resposta');
  const chat = page.locator('.inbox-chat');
  await expect(chat.locator('.bubble.theirs')).toContainText('Câimbra');
  await expect(chat.locator('.bubble.theirs .who')).toHaveText(NAME); // nome real, não "Participante"
  await chat.getByRole('button', { name: 'Equipe a caminho' }).click();
  await expect(chat.locator('.bubble.mine')).toContainText('Equipe a caminho');
  await expect(item).not.toContainText('sem resposta');
  await page.screenshot({ path: 'e2e/screenshots/14-atendimentos.png' });

  await chat.getByRole('button', { name: 'Encerrar atendimento' }).click();
  await page.getByRole('dialog', { name: 'Encerrar atendimento?' }).getByRole('button', { name: 'Encerrar atendimento' }).click();
  await expect(page.locator('.toast')).toContainText('Atendimento encerrado');
  await expect(item).toContainText('Encerrado');
  const thread = await p.helpThread(ev.id, me);
  expect(thread.map((m) => m.body)).toEqual(['Câimbra', 'Equipe a caminho', 'Atendimento encerrado pela organização.']);
  expect((await p.alerts(ev.id)).filter((a) => a.user_id === me && !a.resolved_at && a.type !== 'signal_lost')).toHaveLength(0);

  await chat.getByRole('link', { name: 'Ver perfil e contato' }).click();
  await expect(page.getByRole('dialog', { name: /Perfil de/ })).toBeVisible();
});
