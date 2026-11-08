import { expect, test, type Page } from '@playwright/test';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(EMAIL);
  await page.getByPlaceholder('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.locator('header .signal')).toBeVisible();
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
  await login(page);
  const name = `Evento UI ${Date.now()}`;
  await page.getByPlaceholder(/Nome/).fill(name);
  await page.getByRole('button', { name: /criar/i }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByRole('link', { name: 'Percurso', exact: true }).click();
  const map = page.locator('.map');
  await map.click({ position: { x: 200, y: 200 } });
  await map.click({ position: { x: 400, y: 260 } });
  await map.click({ position: { x: 600, y: 300 } });
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.locator('tbody tr').first().locator('input').first().fill('Largada');
  await expect(page.getByText('Alterações não salvas')).toBeVisible();
  // Sair sem salvar pergunta antes; cancelar mantém o rascunho.
  await page.getByRole('link', { name: 'Monitoramento' }).click();
  await expect(page.getByRole('dialog', { name: 'Sair sem salvar o percurso?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: /salvar percurso/i }).click();
  await expect(page.locator('.toast')).toContainText('Percurso salvo');
  await expect(page.getByText('Tudo salvo')).toBeVisible();
  await shot(page, '03-percurso');

  // Próximo passo positivo é o botão principal; encerrar fica no menu e exige digitar ENCERRAR.
  for (const action of ['Publicar', 'Iniciar evento']) {
    await page.locator('.page-head').getByRole('button', { name: new RegExp(action) }).click();
    await expect(page.locator('.page-head').getByRole('button', { name: new RegExp(action) })).toHaveCount(0);
  }
  await page.getByText('Mais ações').click();
  await page.getByRole('button', { name: 'Encerrar evento…' }).click();
  const ask = page.getByRole('dialog', { name: 'Encerrar o evento?' });
  await expect(ask.getByRole('button', { name: 'Encerrar evento' })).toBeDisabled();
  await ask.getByLabel('Texto de confirmação').fill('encerrar');
  await ask.getByRole('button', { name: 'Encerrar evento' }).click();
  await expect(page.locator('.status-pill')).toHaveText('Encerrado');
  await page.getByText('Mais ações').click();
  await page.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.locator('.status-pill')).toHaveText('Arquivado');
  await page.reload();
  await page.getByRole('link', { name: 'Percurso', exact: true }).click();
  await expect(page.locator('tbody input').first()).toHaveValue('Largada'); // salvou no banco
});

test('monitoramento enxuto; alertas ficam no indicador e na aba', async ({ page }) => {
  await login(page);
  await page.getByRole('row', { name: /ensaio de campo/ }).first().getByRole('link').click();
  await expect(page.locator('.kpi', { hasText: 'Ativos' })).toBeVisible();
  await expect(page.getByText('Onde está o grupo')).toBeVisible();
  await expect(page.locator('.alert, .toast')).toHaveCount(0); // nada de alerta sobre o monitoramento
  await expect(page.locator('.leaflet-interactive').first()).toBeVisible();
  await page.waitForTimeout(1500); // tiles
  await shot(page, '02-monitoramento');

  const signal = page.locator('header .signal');
  await expect(signal).toHaveClass(/emergency/);
  await signal.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400); // animação de entrada
  // O modal precisa ficar acima do mapa (Leaflet usa z-index alto).
  const box = (await page.getByRole('dialog').boundingBox())!;
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[role=dialog]') != null, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(top).toBe(true);
  await shot(page, '06-modal-alertas');
  const rows = page.locator('.alert-row', { hasText: 'Ana Notificação' }); // só alertas criados pelos testes
  const before = await rows.count();
  await rows.first().getByRole('button', { name: 'Resolvido' }).click();
  await expect(rows).toHaveCount(before - 1);
  await page.getByRole('button', { name: 'Fechar' }).click();

  await page.getByRole('link', { name: /^Alertas/ }).click();
  await expect(page.locator('tr.resolved').first()).toBeVisible();
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

test('relatório: indicadores, funil por ponto e linha do tempo por pessoa', async ({ page }) => {
  await login(page);
  await page.getByRole('row', { name: /ensaio de campo/ }).first().getByRole('link').click();
  const openInTab = Number((await page.getByRole('link', { name: /^Alertas/ }).textContent())!.match(/\((\d+)\)/)?.[1] ?? 0);
  if (openInTab) await expect(page.locator('header .signal')).not.toHaveText('Sem alertas');
  await page.getByRole('link', { name: 'Relatório' }).click();
  await expect(page.locator('.kpi', { hasText: 'Concluíram' })).toBeVisible();
  await expect(page.getByText('Avanço por ponto de apoio')).toBeVisible();
  const rows = page.locator('tr.clickable');
  await expect(rows.first()).toBeVisible();
  await shot(page, '07-relatorio');
  // Participante simulado (tem auditoria completa; contas reais antigas podem não ter).
  await rows.filter({ hasText: 'Simulado' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.timeline li').first()).toBeVisible();
  await expect(dialog.getByText(/Passou por|Iniciou o percurso/).first()).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '08-linha-do-tempo');
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: /exportar csv/i }).click();
  expect((await csv).suggestedFilename()).toMatch(/^relatorio-.*\.csv$/);
});
