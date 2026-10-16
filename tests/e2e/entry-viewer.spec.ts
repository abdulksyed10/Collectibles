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
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog').getByText('Mountain pin', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Mountain pin', exact: true })).toBeVisible();
});

test('Explore fills a wide screen and viewer navigation loads the next page without closing', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Requires fixture backend export.');
  await page.route('**/rest/v1/rpc/list_public_entries', async route => {
    const current = route.request().postDataJSON().p_page;
    const entries = Array.from({ length: current === 0 ? 24 : 1 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(current * 24 + index + 1).padStart(12, '0')}`,
      title: `Gallery entry ${current * 24 + index + 1}`, hasPhoto: false,
      collectionId: '00000000-0000-4000-8000-000000000099', collectionName: 'Pins',
      postDate: { kind: 'posted', value: '2026-10-14T12:00:00Z' },
    }));
    await route.fulfill({ json: { entries, total: 25, hasMore: current === 0 } });
  });
  await page.setViewportSize({ width: 2000, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore shared items', exact: true }).click();
  const first = await page.getByRole('button', { name: 'View Gallery entry 1', exact: true }).boundingBox();
  const fifth = await page.getByRole('button', { name: 'View Gallery entry 5', exact: true }).boundingBox();
  expect(first && fifth && Math.abs(first.y - fifth.y) < 2).toBeTruthy();
  await page.getByRole('button', { name: 'View Gallery entry 24', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/^Posted /)).toBeVisible();
  await page.getByRole('button', { name: 'Next entry', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Gallery entry 25', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next entry', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('dialog').getByText('Gallery entry 24', { exact: true })).toBeVisible();
});
