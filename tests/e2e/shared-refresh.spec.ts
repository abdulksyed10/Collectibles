import { expect, test, type Page } from '@playwright/test';
import jpeg from 'jpeg-js';

const collectionId = '00000000-0000-4000-8000-000000000100';
const photoItemId = '00000000-0000-4000-8000-000000000126';
const photo = jpeg.encode({ width: 2, height: 2, data: Buffer.from(Array(4).fill([211, 164, 74, 255]).flat()) }, 80).data;

async function sharedBackend(page: Page) {
  const state = {
    public: true,
    collectionName: 'Public finds',
    items: Array.from({ length: 26 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
      title: `Shared item ${index + 1}`,
      hasPhoto: index === 25,
    })),
    requestedPages: [] as number[],
  };
  await page.route('**/auth/v1/**', route => route.abort());
  await page.route('**/rest/v1/**', async route => {
    if (new URL(route.request().url()).pathname !== '/rest/v1/rpc/get_shared_collection') { await route.abort(); return; }
    const { p_collection_id, p_page } = route.request().postDataJSON();
    if (p_collection_id !== collectionId || !Number.isInteger(p_page) || p_page < 0 || p_page > 20) { await route.fulfill({ status: 400, json: { message: 'Invalid request' } }); return; }
    state.requestedPages.push(p_page);
    if (!state.public) { await route.fulfill({ contentType: 'application/json', body: 'null' }); return; }
    await route.fulfill({ json: {
      collection: { id: collectionId, name: state.collectionName, description: 'Shared collection', categoryName: 'Pins' },
      items: state.items.slice(p_page * 24, (p_page + 1) * 24),
      total: state.items.length,
      hasMore: (p_page + 1) * 24 < state.items.length,
    } });
  });
  await page.route('**/functions/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/functions/v1/public-media' && url.searchParams.get('collectionId') === collectionId && url.searchParams.get('itemId') === photoItemId) {
      await route.fulfill({ contentType: 'image/jpeg', body: photo, headers: { 'Cache-Control': 'no-store' } });
      return;
    }
    await route.abort();
  });
  return state;
}

test('background refresh preserves loaded page and open photo, then removes revoked collection', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Requires a fixture backend export.');
  await page.clock.install();
  const state = await sharedBackend(page);
  await page.goto(`/?collection=${collectionId}`);
  await expect(page.getByRole('button', { name: 'View Shared item 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load more items' }).click();
  await expect(page.getByRole('button', { name: 'View Shared item 26' })).toBeVisible();
  await page.getByRole('button', { name: 'View Shared item 26' }).click();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Shared item 26' }).last()).toBeVisible();

  state.collectionName = 'Updated public finds';
  await page.clock.fastForward(60_000);
  await expect.poll(() => state.requestedPages.filter(pageNumber => pageNumber === 1).length).toBe(2);
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Shared item 26' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Updated public finds', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Shared item 26', exact: true })).toBeVisible();

  state.public = false;
  await page.clock.fastForward(60_000);
  await expect(page.getByText('Collection unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Shared item 26' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
});

test('background refresh removes an item moved out of the public collection', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Requires a fixture backend export.');
  await page.clock.install();
  const state = await sharedBackend(page);
  await page.goto(`/?collection=${collectionId}`);
  await page.getByRole('button', { name: 'Load more items' }).click();
  await expect(page.getByRole('button', { name: 'View Shared item 26' })).toBeVisible();
  await page.getByRole('button', { name: 'View Shared item 26' }).click();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();

  state.items.splice(25, 1);
  await page.clock.fastForward(60_000);
  await expect(page.getByRole('button', { name: 'View Shared item 26' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Shared item 25' })).toBeVisible();
  await expect(page.getByText('25 items', { exact: true })).toBeVisible();
});
