import { expect, test } from '@playwright/test';

test('the recovery route opens code-based password recovery', async ({ page }) => {
  await page.goto('/auth/recovery');
  await expect(page.getByText('Let’s get you back in.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send recovery code', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
});
