import { expect, test } from '@playwright/test';

test('the new-item form offers the multi-photo workflow without changing edit-free creation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true })).toBeVisible();
});
