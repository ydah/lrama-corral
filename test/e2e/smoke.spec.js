import { expect, test } from '@playwright/test';

test('loads a sample grammar and renders parser analysis', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Parse grammar' })).toBeEnabled();
  await page.locator('#presetSelect').selectOption('calc');
  await expect(page.locator('#status')).toContainText('Sample loaded');

  await page.getByRole('button', { name: 'Parse grammar' }).click();

  await expect(page.locator('#status')).toContainText('Parse successful', { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Grammar Structure' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /State Transition Diagram/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Syntax Diagrams/ })).toBeVisible();
});
