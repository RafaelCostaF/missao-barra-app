import { expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

test('pessoas: busca, filtros, perfil e concessão de organizador com histórico', async ({ page }) => {
  const p = await testParticipant(`Diretorio ${Date.now().toString().slice(-6)}`);
  await p.saveStravaLink('https://www.strava.com/athletes/12345', { share_with_org: true }); // link sem API, liberado à organização
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await expect(page.getByText('Missão dada é Missão Barra!')).toBeVisible(); // marca no login
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.getByRole('link', { name: 'Pessoas' }).click();

  await page.getByPlaceholder(/Buscar/).fill(p.email);
  const row = page.locator('tr.clickable', { hasText: p.email });
  await expect(row).toHaveCount(1);
  await page.getByLabel('Papel').selectOption('admin');
  await expect(row).toHaveCount(0); // participante comum some no filtro de organizadores
  await page.getByLabel('Papel').selectOption('all');
  await page.screenshot({ path: 'e2e/screenshots/10-pessoas.png', fullPage: true });

  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Participações (0)')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Ver perfil no Strava' })).toHaveAttribute('href', 'https://www.strava.com/athletes/12345');
  await dialog.getByRole('button', { name: /tornar organizador/i }).click();
  await expect(row.getByText('org')).toBeVisible();
  await dialog.getByRole('button', { name: /retirar organizador/i }).click();
  await expect(row.getByText('org')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar' }).click();

  await page.getByRole('link', { name: 'Equipe' }).click();
  await expect(page.locator('.feed li', { hasText: /deixou a organização · por/ }).first()).toBeVisible();
});
