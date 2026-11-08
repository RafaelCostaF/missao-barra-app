import { expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

test('equipe: promove e remove organizador pelo e-mail', async ({ page }) => {
  const p = await testParticipant('Novo Organizador');
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.getByRole('link', { name: 'Equipe' }).click();
  await expect(page.getByRole('row', { name: /você/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /você/ }).getByRole('button')).toHaveCount(0); // não remove a si mesmo

  await page.getByPlaceholder('E-mail da conta').fill(p.email);
  await page.getByRole('button', { name: /adicionar/i }).click();
  const row = page.getByRole('row', { name: new RegExp(p.email) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Remover' }).click();
  await expect(row).toHaveCount(0);
});
