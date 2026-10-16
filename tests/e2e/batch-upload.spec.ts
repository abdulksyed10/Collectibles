import { expect, test } from '@playwright/test';
import jpeg from 'jpeg-js';

const photo = jpeg.encode({ width: 2, height: 2, data: Buffer.from(Array(4).fill([211, 164, 74, 255]).flat()) }, 80).data;
const files = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `image-${i}.jpg`, mimeType: 'image/jpeg', buffer: photo }));

test('the new-item form offers the multi-photo workflow without changing edit-free creation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true })).toBeVisible();
});

test('demo uploads ten separate entries and allows correcting an empty title before saving', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose photos', exact: true }).click();
  await (await chooser).setFiles(files(10));
  await expect(page.getByText('Photos (10/10)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add 10 items', exact: true }).click();
  await expect(page.getByText('Item name is required.', { exact: true })).toBeVisible();
  await page.getByLabel('Item name', { exact: true }).fill('Batch pin');
  await page.getByRole('button', { name: 'Collection: New collection', exact: true }).click();
  await page.getByLabel('New collection name').fill('Batch collection');
  await page.getByRole('button', { name: 'Add 10 items', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Batch pin', exact: true })).toHaveCount(10);
  await page.getByRole('button', { name: 'Open Batch pin', exact: true }).first().click();
  await expect(page.getByRole('dialog').getByText(/^Posted /)).toBeVisible();
});

test('an oversized selection is rejected without removing the existing queue', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose photos', exact: true }).click();
  await (await chooser).setFiles(files(2));
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add more photos', exact: true }).click();
  await (await chooser).setFiles(files(9));
  await expect(page.getByText('Photos (2/10)', { exact: true })).toBeVisible();
  await expect(page.getByText(/Choose up to 8 more images/)).toBeVisible();
});
