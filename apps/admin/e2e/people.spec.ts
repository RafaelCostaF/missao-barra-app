import { expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

test('rastreio um a um: filtro, busca e perfil com contato', async ({ page }) => {
  // Participante de teste com contato, posição e um chamado aberto.
  const reg = `T-${Date.now().toString().slice(-6)}`;
  const NAME = `Joana ${reg}`; // único por execução
  const p = await testParticipant(NAME, { phone: '+5571998765432', registration_number: reg, emergency_name: 'Irmão', emergency_phone: '(71) 91234-5678', health_notes: 'Alergia a dipirona' });
  const ev = (await p.publishedEvents()).find((e) => e.status === 'live')!;
  await p.joinEvent(ev.id);
  await p.startTracking(ev.id);
  await p.pushPositions(ev.id, [{ lat: -12.9681, lng: -38.4057, accuracy: 5, recordedAt: new Date().toISOString() }], 0, 15);
  await p.raiseAlert(ev.id, 'help');

  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.goto(`/#/evento/${ev.id}/participantes`);

  await page.locator('.chip', { hasText: 'Bateria baixa' }).click();
  await expect(page.locator('tr.clickable', { hasText: NAME })).toBeVisible();
  await page.locator('.chip', { hasText: 'Chamado aberto' }).click();
  await expect(page.locator('tr.clickable', { hasText: NAME })).toBeVisible();
  await page.locator('.chip', { hasText: 'Todos' }).click();
  await page.getByPlaceholder(/Buscar/).fill(reg);
  await expect(page.locator('tr.clickable')).toHaveCount(1);
  await page.getByPlaceholder(/Buscar/).fill('98765'); // por celular
  await expect(page.locator('tr.clickable', { hasText: NAME })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/09-participantes.png' });

  await page.locator('tr.clickable', { hasText: NAME }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('(71) 99876-5432', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5571998765432');
  await expect(dialog.getByRole('link', { name: 'Ligar' }).first()).toHaveAttribute('href', 'tel:+5571998765432');
  await expect(dialog.getByText(/Irmão/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Google Maps' })).toHaveAttribute('href', /query=-12\.9681,-38\.4057/);
  await expect(dialog.getByRole('link', { name: 'Ver no mapa do evento' })).toHaveAttribute('href', new RegExp(`#/evento/${ev.id}/monitor/`));
  await expect(dialog.getByText('Iniciou o percurso')).toBeVisible();
  await expect(dialog.getByText('verificado', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Alergia a dipirona')).toBeVisible();
  await expect(dialog.getByText('15%')).toBeVisible(); // bateria
  const profile = page.getByRole('dialog', { name: /Perfil de/ });
  await profile.getByRole('button', { name: 'Finalizar participação' }).click(); // desistência registrada pela organização
  await page.getByRole('dialog', { name: /Finalizar a participação/ }).getByRole('button', { name: 'Finalizar participação' }).click();
  await expect(page.locator('.toast')).toContainText('finalizada');
  await expect(profile.getByRole('button', { name: 'Finalizar participação' })).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/10-perfil.png' });
});
