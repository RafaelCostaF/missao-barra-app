import { devices, expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';
const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7'];
test.use(pixel); // painel usado em campo pelo celular

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('painel no celular: monitoramento, participantes e perfil sem rolagem lateral', async ({ page }) => {
  const NAME = `Celular ${Date.now().toString().slice(-5)}`;
  const p = await testParticipant(NAME, { phone: '+5571991112233' });
  const ev = (await p.publishedEvents()).find((e) => e.status === 'live')!;
  await p.joinEvent(ev.id);
  await p.startTracking(ev.id);
  await p.pushPositions(ev.id, [{ lat: -12.9681, lng: -38.4057, accuracy: 5, recordedAt: new Date().toISOString() }], 0, 80);

  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.goto(`/#/evento/${ev.id}`);
  await expect(page.locator('.kpi', { hasText: 'Ativos' })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/screenshots/11-celular-monitoramento.png', fullPage: true });

  await page.goto(`/#/evento/${ev.id}/participantes`);
  await page.getByPlaceholder(/Buscar/).fill(NAME);
  await expect(page.locator('tr.clickable')).toHaveCount(1);
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.screenshot({ path: 'e2e/screenshots/12-celular-participantes.png' });

  await page.locator('tr.clickable').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Ligar' }).first()).toBeVisible();
  await page.waitForTimeout(500); // fim da animação de entrada
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1); // modal em tela cheia
  await page.screenshot({ path: 'e2e/screenshots/13-celular-perfil.png' });
});
