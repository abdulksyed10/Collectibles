import { expect, test } from '@playwright/test';

test('entry viewer keeps its close and owner controls reachable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Open Mountain pin', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous entry', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next entry', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous entry', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Cat pin', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Mountain pin', exact: true })).toBeVisible();
});
