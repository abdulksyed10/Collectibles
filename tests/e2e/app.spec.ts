import { test, expect, type Page } from '@playwright/test';
import jpeg from 'jpeg-js';
const owner = '00000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'collector@example.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: now };
const access = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'test-signature'].join('.');
async function fakeBackend(page: Page, options: { failPhoto?: boolean; failLogoutOnce?: boolean; categoryCount?: number } = {}) {
  let categories: any[] = [{ id: 'pins', owner_id: owner, name: 'Pins', created_at: now }]; let collections: any[] = []; let items: any[] = []; let imageIds = new Set<string>(); let sequence = 10;
  for (let i = 1; i < (options.categoryCount ?? 1); i++) categories.push({ id: `category-${i}`, owner_id: owner, name: `Category ${i + 1}`, created_at: now });
  if (options.failPhoto) { collections = [{ id: 'travel', category_id: 'pins', owner_id: owner, name: 'Travel', description: '', visibility: 'private', acquired_on: '2026-01-01', created_at: now }]; items = [{ id: 'existing', owner_id: owner, collection_id: 'travel', title: 'Old name', notes: '', created_at: now, updated_at: now }]; }
  const photo = 'data:image/jpeg;base64,' + jpeg.encode({width:2,height:2,data:Buffer.from(Array(4).fill([211,164,74,255]).flat())},80).data.toString('base64');
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) { if (options.failLogoutOnce) { options.failLogoutOnce = false; await route.fulfill({ status: 500, json: { message: 'Could not sign out. Try again.' } }); return; } await route.fulfill({status:204}); return; }
    await route.fulfill({json:{access_token:access,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user}});
  });
  await page.route('**/rest/v1/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split('/').at(-1); let rows = table === 'categories' ? categories : table === 'collections' ? collections : items;
    if (table === 'get_shared_collection') {
      const { p_collection_id, p_page = 0 } = req.postDataJSON();
      const collection = collections.find(c => c.id === p_collection_id && c.visibility === 'public');
      if (!collection) { await route.fulfill({ contentType: 'application/json', body: 'null' }); return; }
      const matching = items.filter(i => i.collection_id === collection.id);
      await route.fulfill({ json: { collection: { id: collection.id, name: collection.name, description: collection.description, categoryName: categories.find(c => c.id === collection.category_id)?.name }, items: matching.slice(p_page * 24, (p_page + 1) * 24).map(i => ({ id: i.id, title: i.title, hasPhoto: imageIds.has(i.id) })), total: matching.length, hasMore: matching.length > (p_page + 1) * 24 } }); return;
    }
    const id = url.searchParams.get('id')?.replace('eq.','');
    if (req.method() === 'POST') { const value = req.postDataJSON(); const row = {...value,id:`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,owner_id:owner,created_at:now,updated_at:now}; rows.push(row); await route.fulfill({json:row}); return; }
    if (req.method() === 'DELETE') { if (collections.some(c => c.category_id === id)) { await route.fulfill({ status: 409, json: { code: '23503', message: 'Category has collections' } }); return; } categories = categories.filter(c => c.id !== id); await route.fulfill({ status: 204 }); return; }
    if (req.method() === 'PATCH') { const row=rows.find(r=>r.id===id); Object.assign(row,req.postDataJSON()); await route.fulfill({json:row}); return; }
    if (url.searchParams.has('collections.category_id')) { const categoryId = url.searchParams.get('collections.category_id')!.replace('eq.', ''); rows = rows.filter(r => collections.some(c => c.id === r.collection_id && c.category_id === categoryId)); }
    if (url.searchParams.has('collections.visibility')) rows = rows.filter(r => collections.some(c => c.id === r.collection_id && c.visibility === url.searchParams.get('collections.visibility')!.replace('eq.', '')));
    if (url.searchParams.has('collection_id')) rows=rows.filter(r=>r.collection_id===url.searchParams.get('collection_id')!.replace('eq.',''));
    const search = url.searchParams.get('title')?.replace('ilike.%','').replace(/%$/,''); if(search) rows=rows.filter(r=>r.title.toLowerCase().includes(search.toLowerCase()));
    await route.fulfill({json:rows,headers:{'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
  });
  await page.route('**/functions/v1/media', async route => {
    const body=route.request().postDataJSON();
    if(body.action==='upload') { if (options.failPhoto) { await route.fulfill({ status: 503, json: { error: 'Photo upload is temporarily unavailable.' } }); return; } imageIds.add(body.itemId); await route.fulfill({json:{ok:true}}); return; }
    if(body.action==='read') { await route.fulfill({json:{images:body.itemIds.filter((id:string)=>imageIds.has(id)).map((itemId:string)=>({itemId,url:photo,thumbnailUrl:photo,expiresAt:new Date(Date.now()+300000).toISOString()}))}}); return; }
    if(body.action==='delete-item') { items=items.filter(p=>p.id!==body.itemId); imageIds.delete(body.itemId); }
    if(body.action==='delete-collection') { items=items.filter(p=>p.collection_id!==body.collectionId); collections=collections.filter(c=>c.id!==body.collectionId); }
    await route.fulfill({json:{ok:true}});
  });
  return { collections: () => collections, items: () => items };
}

async function exerciseHierarchy(page: Page) {
  await page.getByRole('button', { name: 'New category', exact: true }).first().click();
  await page.getByLabel('Category name').fill('Boots');
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  // An empty selected category must create a collection here, not add to another category.
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
  await page.getByLabel('Collection name').fill('Vintage');
  await expect(page.getByRole('button', { name: 'Category: Boots', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
  await page.getByLabel('Item name').fill('Desert boots');
  await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Desert boots' })).toBeVisible();
  await page.getByRole('button', { name: 'Pins', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Desert boots' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Boots', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Desert boots' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit this category' }).click();
  await expect(page.getByText('Move or delete its collections before deleting this category.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete category', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'New category', exact: true }).first().click();
  await page.getByLabel('Category name').fill('Footwear');
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  await page.getByRole('button', { name: 'Boots', exact: true }).click();
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  await page.getByRole('button', { name: 'Edit this collection' }).click();
  await page.getByRole('button', { name: 'Category: Footwear', exact: true }).click();
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Desert boots' })).toBeVisible();
  await page.getByRole('button', { name: 'Boots', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Desert boots' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit this category' }).click();
  await page.getByRole('button', { name: 'Delete category', exact: true }).click();
  await page.getByRole('button', { name: 'Permanently delete category', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Boots', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Footwear', exact: true }).click();
  await page.getByRole('button', { name: 'Edit this category' }).click();
  await page.getByLabel('Category name').fill('Boots and shoes');
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Boots and shoes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Desert boots' })).toBeVisible();
}
test.describe('connected UI fixtures', () => {
test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Enable only with a fixture backend export.');

test('connected hierarchy creates custom types and moves collections between them', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 1000 });
  await fakeBackend(page); await page.goto('/');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await exerciseHierarchy(page);
});

test('desktop navigation keeps all twenty categories reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await fakeBackend(page, { categoryCount: 20 }); await page.goto('/');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Category 20', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Category 20', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const create = page.getByRole('button', { name: 'New collection', exact: true }).first();
  const bounds = await create.boundingBox();
  expect(bounds && bounds.y + bounds.height <= 768).toBeTruthy();
  await create.click();
  await expect(page.getByRole('button', { name: 'Category: Category 20', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('mobile collector can create, photograph, edit, search and delete a private item', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await fakeBackend(page);
  const errors:string[]=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password',{exact:true}).fill('fixture-password'); await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'New collection',exact:true}).first().click(); await page.getByLabel('Collection name').fill('Travel finds'); await page.getByRole('button',{name:'Create collection',exact:true}).click();
  await page.getByRole('button',{name:'Add item',exact:true}).first().click();
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button',{name:'Choose photo',exact:true}).click(); const input=await chooser;
  await input.setFiles({name:'item.jpg',mimeType:'image/jpeg',buffer:jpeg.encode({width:20,height:20,data:Buffer.from(Array(400).fill([211,164,74,255]).flat())},80).data});
  await expect(page.getByRole('button',{name:'Choose another'})).toBeVisible();
  await page.getByLabel('Item name').fill('Mountain item'); await page.getByLabel('Notes (optional)').fill('A souvenir from a great trip.'); await page.getByRole('dialog').getByRole('button',{name:'Add item',exact:true}).click();
  await page.getByRole('button',{name:'Open Mountain item',exact:true}).click(); await expect(page.getByText('A souvenir from a great trip.')).toBeVisible();
  await page.getByRole('button',{name:'Edit item',exact:true}).click(); await page.getByLabel('Item name').fill('Yosemite item'); await page.getByRole('button',{name:'Save item',exact:true}).click();
  await page.getByLabel('Search items').fill('missing'); await expect(page.getByText('No matching items',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).first().click(); await page.getByRole('button',{name:'Open Yosemite item'}).click(); await page.getByRole('button',{name:'Delete',exact:true}).click(); await page.getByRole('button',{name:'Permanently delete item'}).click();
  await expect(page.getByText('No items yet',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy(); expect(errors).toEqual([]);
  await page.screenshot({path:'.artifacts/mobile-library.png',fullPage:true});
});
test('desktop entry renders and rejects invalid login input without calling the backend', async ({page}) => {
  await page.setViewportSize({width:1365,height:900}); await fakeBackend(page); await page.goto('/');
  await expect(page.getByText('Every find has',{exact:false})).toBeVisible();
  await page.screenshot({path:'.artifacts/desktop-signin.png',fullPage:true});
  await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page.getByText('Enter a valid email address.')).toBeVisible();
});

test('closing an existing item after a failed photo upload refreshes its saved details', async ({ page }) => {
  await fakeBackend(page, { failPhoto: true }); await page.goto('/');
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open Old name' }).click(); await page.getByRole('button', { name: 'Edit item' }).click();
  await page.getByLabel('Item name').fill('Saved new name');
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose photo', exact: true }).click();
  await (await chooser).setFiles({ name: 'item.jpg', mimeType: 'image/jpeg', buffer: jpeg.encode({ width: 2, height: 2, data: Buffer.from(Array(4).fill([211,164,74,255]).flat()) }, 80).data });
  await expect(page.getByRole('button', { name: 'Choose another' })).toBeVisible();
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByText(/Your item details are saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Saved new name' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Old name' })).toHaveCount(0);
});

test('local session cleanup can be retried after an account deletion succeeds', async ({ page }) => {
  await fakeBackend(page); await page.goto('/');
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Account settings' }).click(); await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key: string) {
      if (key.endsWith('-auth-token')) { Storage.prototype.removeItem = original; throw new Error('Local sign out failed. Try again.'); }
      return original.call(this, key);
    };
  });
  await page.getByLabel('Type DELETE to confirm').fill('DELETE'); await page.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(page.getByText('Local sign out failed. Try again.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('server logout failure still clears the local session', async ({ page }) => {
  await fakeBackend(page, { failLogoutOnce: true }); await page.goto('/');
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Account settings' }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.endsWith('-auth-token')))).toBe(false);
});
});

test('demo works without services and resets changes when leaving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const serviceRequests: string[] = []; const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/(auth|rest|functions)\/v1\//, route => { serviceRequests.push(route.request().url()); return route.abort(); });
  await page.goto('/');
  if (process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true') await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Mountain pin' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Mountain pin', exact: true })).toBeVisible();
  await page.screenshot({ path: '.artifacts/mobile-demo.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Open Mountain pin' }).click(); await page.getByRole('button', { name: 'Edit item' }).click();
  await page.getByLabel('Item name').fill('My temporary edit'); await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.getByLabel('Search items').fill('temporary'); await expect(page.getByRole('button', { name: 'Open My temporary edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Account settings' }).click(); await page.getByRole('button', { name: 'Exit demo', exact: true }).click(); await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Mountain pin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open My temporary edit' })).toHaveCount(0);
  expect(serviceRequests).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 1365, height: 900 });
  await expect(page.getByRole('button', { name: 'Open Lakeside cap' })).toBeVisible();
  await page.screenshot({ path: '.artifacts/desktop-demo.png', fullPage: true, animations: 'disabled' });
});

test('demo supports custom collectible types, collection moves and empty category deletion on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await exerciseHierarchy(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('demo uses plain mobile controls, private defaults, editable dates and a read-only public preview', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/'); await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Private collections' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Small pins|Big memories|Every souvenir|ONLY YOU|YOUR PRIVATE COLLECTION/)).toHaveCount(0);
  const firstItem = await page.getByRole('button', { name: 'Open Mountain pin' }).boundingBox();
  expect(firstItem && firstItem.y < 600).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('tab', { name: 'Public collections' }).click();
  await expect(page.getByText('No public collections', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New collection', exact: true }).first().click();
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  await expect(page.getByLabel('Acquired date', { exact: true })).toHaveValue(today);
  await expect(page.getByRole('button', { name: 'Visibility: Private', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Collection name').fill('Dated collection');
  await page.getByLabel('Acquired date', { exact: true }).fill('2020-02-29');
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Private collections' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Acquired 2020-02-29', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
  await page.getByLabel('Item name').fill('Shared sample');
  await page.getByLabel('Notes (optional)').fill('Keep this note private');
  await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: 'Edit this collection' }).click();
  await page.getByRole('button', { name: 'Visibility: Public', exact: true }).click();
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Public collections' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Share collection', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview public view' }).click();
  await expect(page.getByRole('button', { name: 'View Shared sample', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Shared sample', exact: true }).click();
  await expect(page.getByText('Keep this note private')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit item', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Public collections' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Edit this collection' }).click();
  await expect(page.getByLabel('Acquired date', { exact: true })).toHaveValue('2020-02-29');
  await page.getByRole('button', { name: 'Visibility: Private', exact: true }).click();
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await page.getByRole('tab', { name: 'Public collections' }).click();
  await expect(page.getByRole('button', { name: 'Open Shared sample' })).toHaveCount(0);
});

test('connected sharing works anonymously, keeps notes private and revokes access', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Requires fixture backend export.');
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fakeBackend(page); await page.goto('/');
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New collection', exact: true }).first().click();
  await page.getByLabel('Collection name').fill('Shared collection');
  await page.getByLabel('Acquired date', { exact: true }).fill('2020-02-29');
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  expect(state.collections()[0].visibility).toBe('private');
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
  await page.getByLabel('Item name').fill('Public item'); await page.getByLabel('Notes (optional)').fill('Personal purchase note');
  await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: 'Edit this collection' }).click();
  await page.getByRole('button', { name: 'Visibility: Public', exact: true }).click(); await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: { url: string }) => { (window as any).__sharedUrl = data.url; } }); });
  await page.getByRole('button', { name: 'Share collection', exact: true }).click();
  const sharedUrl = await page.evaluate(() => (window as any).__sharedUrl as string);
  expect(new URL(sharedUrl).search).toBe(`?collection=${state.collections()[0].id}`);
  await page.getByRole('tab', { name: 'Private collections' }).click();
  await page.getByRole('button', { name: 'New collection', exact: true }).first().click();
  await page.getByLabel('Collection name').fill('Private collection'); await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await page.getByRole('button', { name: 'All collections', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Collection: Private collection', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Collection: Shared collection', exact: true })).toHaveCount(0);
  await page.getByLabel('Item name').fill('Private item'); await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Private item', exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.clear());
  // Finish the owner document before measuring requests from the anonymous view.
  await page.goto('about:blank');
  const ownerRequests: string[] = [];
  page.on('request', req => { if (/\/rest\/v1\/(categories|collections|items)(\?|$)/.test(req.url()) || /\/functions\/v1\/media$/.test(req.url())) ownerRequests.push(req.url()); });
  await page.goto(sharedUrl);
  await expect(page.getByRole('button', { name: 'View Public item', exact: true })).toBeVisible();
  await expect(page.getByText(/Personal purchase note|2020-02-29|Private item/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit this collection' })).toHaveCount(0);
  expect(ownerRequests).toEqual([]);
  state.collections()[0].visibility = 'private';
  await page.reload(); await expect(page.getByText('Collection unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Public item', exact: true })).toHaveCount(0);
});
