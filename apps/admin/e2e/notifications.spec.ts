import { expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

// Outro "aparelho" inicia, pede ajuda, aciona emergência e finaliza; o painel registra sem cobrir o monitoramento.
test('indicador pisca com ajuda/emergência; início e fim vão para a atividade', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  const signal = page.locator('header .signal');
  await expect(signal).toBeVisible();
  await page.waitForTimeout(3000); // assinatura do Realtime ativa

  const p = await testParticipant('Ana Notificação');
  const ev = (await p.publishedEvents()).find((e) => e.status === 'live')!;
  await p.joinEvent(ev.id);
  await p.startTracking(ev.id);
  await p.pushPositions(ev.id, [{ lat: -12.96, lng: -38.37, accuracy: 5, recordedAt: new Date().toISOString() }], 0);
  await p.raiseAlert(ev.id, 'help');
  await expect(signal).toHaveClass(/warn|emergency/, { timeout: 15_000 });
  await p.raiseAlert(ev.id, 'emergency');
  await expect(signal).toHaveClass(/emergency/, { timeout: 15_000 });
  await p.finish(ev.id);
  await expect(page.locator('.toast')).toHaveCount(0);

  await signal.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.alert-row', { hasText: 'Ana Notificação' })).toHaveCount(2);
  await expect(dialog.locator('.feed li', { hasText: 'Ana Notificação começou' })).toHaveCount(1, { timeout: 15_000 });
  await expect(dialog.locator('.feed li', { hasText: 'Ana Notificação finalizou' })).toHaveCount(1, { timeout: 15_000 });
  await page.screenshot({ path: 'e2e/screenshots/05-alertas-modal.png' });
});
