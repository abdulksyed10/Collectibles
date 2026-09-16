import { test, expect, type Page } from '@playwright/test';
import jpeg from 'jpeg-js';
const owner = '00000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'collector@example.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: now };
const access = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'test-signature'].join('.');
async function fakeBackend(page: Page, options: { failPhoto?: boolean; failLogoutOnce?: boolean } = {}) {
  let collections: any[] = []; let pins: any[] = []; let imageIds = new Set<string>(); let sequence = 10;
  if (options.failPhoto) { collections = [{ id: 'travel', owner_id: owner, name: 'Travel', description: '', created_at: now }]; pins = [{ id: 'existing', owner_id: owner, collection_id: 'travel', title: 'Old name', notes: '', created_at: now, updated_at: now }]; }
  const photo = 'data:image/jpeg;base64,' + jpeg.encode({width:2,height:2,data:Buffer.from(Array(4).fill([211,164,74,255]).flat())},80).data.toString('base64');
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) { if (options.failLogoutOnce) { options.failLogoutOnce = false; await route.fulfill({ status: 500, json: { message: 'Could not sign out. Try again.' } }); return; } await route.fulfill({status:204}); return; }
    await route.fulfill({json:{access_token:access,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user}});
  });
  await page.route('**/rest/v1/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split('/').at(-1); let rows = table === 'collections' ? collections : pins;
    const id = url.searchParams.get('id')?.replace('eq.','');
    if (req.method() === 'POST') { const value = req.postDataJSON(); const row = {...value,id:`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,owner_id:owner,created_at:now,updated_at:now}; rows.push(row); await route.fulfill({json:row}); return; }
    if (req.method() === 'PATCH') { const row=rows.find(r=>r.id===id); Object.assign(row,req.postDataJSON()); await route.fulfill({json:row}); return; }
    if (url.searchParams.has('collection_id')) rows=rows.filter(r=>r.collection_id===url.searchParams.get('collection_id')!.replace('eq.',''));
    const search = url.searchParams.get('title')?.replace('ilike.%','').replace(/%$/,''); if(search) rows=rows.filter(r=>r.title.toLowerCase().includes(search.toLowerCase()));
    await route.fulfill({json:rows,headers:{'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
  });
  await page.route('**/functions/v1/media', async route => {
    const body=route.request().postDataJSON();
    if(body.action==='upload') { if (options.failPhoto) { await route.fulfill({ status: 503, json: { error: 'Photo upload is temporarily unavailable.' } }); return; } imageIds.add(body.pinId); await route.fulfill({json:{ok:true}}); return; }
    if(body.action==='read') { await route.fulfill({json:{images:body.pinIds.filter((id:string)=>imageIds.has(id)).map((pinId:string)=>({pinId,url:photo,thumbnailUrl:photo,expiresAt:new Date(Date.now()+300000).toISOString()}))}}); return; }
    if(body.action==='delete-pin') { pins=pins.filter(p=>p.id!==body.pinId); imageIds.delete(body.pinId); }
    if(body.action==='delete-collection') { pins=pins.filter(p=>p.collection_id!==body.collectionId); collections=collections.filter(c=>c.id!==body.collectionId); }
    await route.fulfill({json:{ok:true}});
  });
}
test.describe('connected UI fixtures', () => {
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Enable only with a fixture backend export.');

test('mobile collector can create, photograph, edit, search and delete a private pin', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await fakeBackend(page);
  const errors:string[]=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password',{exact:true}).fill('fixture-password'); await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Create your first collection'}).click(); await page.getByLabel('Collection name').fill('Travel finds'); await page.getByRole('button',{name:'Create collection',exact:true}).click();
  await page.getByRole('button',{name:'Add a pin',exact:true}).click();
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button',{name:'Choose photo',exact:true}).click(); const input=await chooser;
  await input.setFiles({name:'pin.jpg',mimeType:'image/jpeg',buffer:jpeg.encode({width:20,height:20,data:Buffer.from(Array(400).fill([211,164,74,255]).flat())},80).data});
  await expect(page.getByRole('button',{name:'Choose another'})).toBeVisible();
  await page.getByLabel('Pin name').fill('Mountain pin'); await page.getByLabel('Notes (optional)').fill('A souvenir from a great trip.'); await page.getByRole('button',{name:'Add to collection',exact:true}).click();
  await page.getByRole('button',{name:'Open Mountain pin',exact:true}).click(); await expect(page.getByText('A souvenir from a great trip.')).toBeVisible();
  await page.getByRole('button',{name:'Edit pin',exact:true}).click(); await page.getByLabel('Pin name').fill('Yosemite pin'); await page.getByRole('button',{name:'Save pin',exact:true}).click();
  await page.getByLabel('Search pins').fill('missing'); await expect(page.getByText('No pins found.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).first().click(); await page.getByRole('button',{name:'Open Yosemite pin'}).click(); await page.getByRole('button',{name:'Delete',exact:true}).click(); await page.getByRole('button',{name:'Permanently delete pin'}).click();
  await expect(page.getByText('Your next favorite belongs here.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy(); expect(errors).toEqual([]);
  await page.screenshot({path:'.artifacts/mobile-library.png',fullPage:true});
});
test('desktop entry renders and rejects invalid login input without calling the backend', async ({page}) => {
  await page.setViewportSize({width:1365,height:900}); await fakeBackend(page); await page.goto('/');
  await expect(page.getByText('Every pin has',{exact:false})).toBeVisible();
  await page.screenshot({path:'.artifacts/desktop-signin.png',fullPage:true});
  await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page.getByText('Enter a valid email address.')).toBeVisible();
});

test('closing an existing pin after a failed photo upload refreshes its saved details', async ({ page }) => {
  await fakeBackend(page, { failPhoto: true }); await page.goto('/');
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open Old name' }).click(); await page.getByRole('button', { name: 'Edit pin' }).click();
  await page.getByLabel('Pin name').fill('Saved new name');
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose photo', exact: true }).click();
  await (await chooser).setFiles({ name: 'pin.jpg', mimeType: 'image/jpeg', buffer: jpeg.encode({ width: 2, height: 2, data: Buffer.from(Array(4).fill([211,164,74,255]).flat()) }, 80).data });
  await expect(page.getByRole('button', { name: 'Choose another' })).toBeVisible();
  await page.getByRole('button', { name: 'Save pin', exact: true }).click();
  await expect(page.getByText(/Your pin details are saved/)).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Open Mountain memories' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Mountain memories', exact: true })).toBeVisible();
  await page.screenshot({ path: '.artifacts/mobile-demo.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Open Mountain memories' }).click(); await page.getByRole('button', { name: 'Edit pin' }).click();
  await page.getByLabel('Pin name').fill('My temporary edit'); await page.getByRole('button', { name: 'Save pin', exact: true }).click();
  await page.getByLabel('Search pins').fill('temporary'); await expect(page.getByRole('button', { name: 'Open My temporary edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click(); await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Mountain memories' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open My temporary edit' })).toHaveCount(0);
  expect(serviceRequests).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 1365, height: 900 });
  await expect(page.getByRole('button', { name: 'Open Golden hour' })).toBeVisible();
  await page.screenshot({ path: '.artifacts/desktop-demo.png', fullPage: true, animations: 'disabled' });
});
