import { expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

test('controle clicável: trecho → pessoa no mapa → perfil; funil do relatório; centralizar', async ({ page }) => {
  // Corredor de teste no meio do 1º trecho do percurso.
  const NAME = `Trecho ${Date.now().toString().slice(-6)}`;
  const p = await testParticipant(NAME);
  const ev = (await p.publishedEvents()).find((e) => e.status === 'live')!;
  const [a, b] = await p.checkpoints(ev.id);
  await p.joinEvent(ev.id);
  await p.startTracking(ev.id);
  await p.pushPositions(ev.id, [{ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2, accuracy: 5, recordedAt: new Date().toISOString() }], 1000);

  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.goto(`/#/evento/${ev.id}/monitor`);

  // Trecho clicável abre a lista; nome foca no mapa (balão aberto) e mostra a barra de seleção.
  await page.locator('button.bar-row', { hasText: `${a.name} → ${b.name}` }).click();
  await page.locator('.people-list button.linkish', { hasText: NAME }).click();
  await expect(page.locator('.selection')).toContainText(`Em foco: ${NAME}`);
  await expect(page.locator('.leaflet-popup-content')).toContainText(NAME);
  await page.screenshot({ path: 'e2e/screenshots/11-foco-no-mapa.png' });
  await page.getByRole('button', { name: /centralizar/i }).click();

  // Do balão do mapa para o perfil com contato.
  await page.locator('.leaflet-popup-content a', { hasText: 'Ver perfil' }).click();
  await expect(page.getByRole('dialog')).toContainText(NAME);
  await page.getByRole('dialog').getByRole('link', { name: 'Ver no mapa do evento' }).click();
  await expect(page.locator('.selection')).toContainText(NAME);
  await page.getByRole('button', { name: 'Limpar seleção' }).click();
  await expect(page.locator('.selection')).toHaveCount(0);

  // Números do topo levam à lista filtrada.
  await page.locator('a.kpi', { hasText: 'Ativos' }).click();
  await expect(page.locator('.chip.active')).toContainText('Monitorando');
  await expect(page.locator('tr.clickable', { hasText: NAME })).toBeVisible();

  // Relatório: ponto de apoio mostra quem passou e quem não passou.
  await page.getByRole('link', { name: 'Relatório' }).click();
  await page.locator('button.bar-row.funnel').first().click();
  await expect(page.locator('.funnel-detail')).toContainText('Passaram');
  await expect(page.locator('.funnel-detail')).toContainText('Ainda não passaram');
  await page.screenshot({ path: 'e2e/screenshots/12-funil-clicavel.png', fullPage: true });
});
