import { expect, test, type Page } from '@playwright/test';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText('Missão Barra · Painel')).toBeVisible();
}

test('senha errada não entra', async ({ page }) => {
  await page.goto('/');
  await shot(page, '01-login');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill('errada');
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible();
});

test('cria evento pela interface, marca o percurso e conduz o ciclo de vida', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await login(page);
  const name = `Evento UI ${Date.now()}`;
  await page.getByPlaceholder(/Nome/).fill(name);
  await page.getByRole('button', { name: /criar/i }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByRole('button', { name: 'Percurso e apoio' }).click();
  const map = page.locator('.map');
  await map.click({ position: { x: 200, y: 200 } });
  await map.click({ position: { x: 400, y: 260 } });
  await map.click({ position: { x: 600, y: 300 } });
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.locator('tbody tr').first().locator('input').first().fill('Largada');
  await page.getByRole('button', { name: /salvar percurso/i }).click();
  await shot(page, '03-percurso');

  for (const action of ['Publicar', 'Iniciar evento', 'Encerrar evento', 'Arquivar']) {
    await page.getByRole('button', { name: new RegExp(action) }).click();
    await expect(page.getByRole('button', { name: new RegExp(action) })).toHaveCount(0);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Percurso e apoio' }).click();
  await expect(page.locator('tbody input').first()).toHaveValue('Largada'); // salvou no banco
});

test('acompanha o evento simulado ao vivo e resolve a emergência', async ({ page }) => {
  await login(page);
  await page.getByRole('row', { name: /ensaio de campo/ }).first().getByRole('link').click();
  await expect(page.getByText('Monitorando', { exact: true }).first()).toBeVisible();
  const alert = page.locator('.alert', { hasText: 'EMERGÊNCIA' }).first();
  await expect(alert).toBeVisible();
  await expect(page.locator('tbody tr')).not.toHaveCount(0);
  await expect(page.locator('.leaflet-interactive').first()).toBeVisible(); // marcadores no mapa
  await shot(page, '02-ao-vivo');
  const before = await page.locator('.alert', { hasText: 'EMERGÊNCIA' }).count();
  await alert.getByRole('button', { name: 'Resolvido' }).click();
  await expect(page.locator('.alert', { hasText: 'EMERGÊNCIA' })).toHaveCount(before - 1);
});

test('logs: filtra por nível e exporta CSV', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Logs' }).click();
  await page.locator('select').selectOption('info');
  await page.getByRole('button', { name: /filtrar/i }).click();
  await expect(page.locator('tbody tr').first()).toContainText('info');
  await shot(page, '04-logs');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /exportar csv/i }).click();
  expect((await download).suggestedFilename()).toMatch(/^logs-.*\.csv$/);
});
