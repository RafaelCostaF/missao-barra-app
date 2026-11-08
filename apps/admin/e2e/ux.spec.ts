import { createClient } from '@supabase/supabase-js';
import { devices, expect, test } from '@playwright/test';
import { testParticipant } from './participant';

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';
const URL = process.env.VITE_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test('esqueci minha senha: link do e-mail abre a página e a nova senha funciona', async ({ page, baseURL }) => {
  const p = await testParticipant(`Senha ${Date.now().toString().slice(-6)}`);
  // O e-mail real não é lido no teste: o link é gerado como o Auth faria.
  const sa = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data, error } = await sa.auth.admin.generateLink({ type: 'recovery', email: p.email, options: { redirectTo: `${baseURL}/` } });
  if (error) throw error;
  await page.goto(data.properties.action_link);
  await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible();
  await page.getByPlaceholder('Nova senha', { exact: true }).fill('curta');
  await page.getByPlaceholder('Repita a nova senha').fill('curta');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.locator('.form-error')).toContainText('8');
  await page.getByPlaceholder('Nova senha', { exact: true }).fill('nova-senha-2026');
  await page.getByPlaceholder('Repita a nova senha').fill('nova-senha-2026');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByText('Senha alterada')).toBeVisible();
  const fresh = createClient(URL, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  expect((await fresh.auth.signInWithPassword({ email: p.email, password: 'nova-senha-2026' })).error).toBeNull();
});

test.describe('celular', () => {
  const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7'];
  test.use(pixel);
  test('cabeçalho: alertas sempre visíveis e navegação no menu', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('E-mail').fill(EMAIL);
    await page.getByPlaceholder('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    const signal = page.locator('header .signal');
    await expect(signal).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Pessoas' })).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('link', { name: 'Pessoas' }).click();
    await expect(page).toHaveURL(/#\/pessoas/);
    await expect(page.getByRole('link', { name: 'Pessoas' })).toBeHidden(); // menu fecha ao navegar
    await expect(page.getByRole('button', { name: 'Sair' })).toBeHidden();
    await page.screenshot({ path: 'e2e/screenshots/13-celular-cabecalho.png' });
  });
});
