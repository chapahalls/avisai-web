import { expect, test } from '@playwright/test';

/**
 * Fumaça: login na Demo (sem senha, sem backend) → painel do CCO com a fila de alertas
 * renderizada → troca de idioma → logout. Cobre o caminho feliz que o resto da suíte
 * (node:test, sobre o motor da Demo) não exercita: o roteamento real do navegador e o
 * carregamento do app completo.
 */
test('login na Demo abre o painel, troca de idioma funciona e logout volta ao login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar com SSO' }).click();

  // A Demo abre direto na simulação do app do motorista (70a2414); o painel do CCO vem pela aba.
  await expect(page).toHaveURL(/\/dashboard\/mobile-demo$/);
  await page.getByRole('link', { name: 'Monitoramento', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Fila de alertas' })).toBeVisible();
  await expect(page.getByText('Nenhum alerta aberto. A operação está em dia.')).toBeVisible();

  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Alert queue' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
