import { expect, test, type Page } from '@playwright/test';
import jpeg from 'jpeg-js';

const owner = '00000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'collector@example.test', app_metadata: {}, user_metadata: {}, identities: [], created_at: now };
const access = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test-signature'].join('.');

async function fakeBackend(page: Page) {
  await page.addInitScript(() => { (window as any).turnstile={render:(_target:unknown,options:any)=>{queueMicrotask(()=>options.callback('fixture-captcha-token-that-is-long-enough'));return 'fixture';},remove:()=>{}}; });
  let accepted=false;
  let collections: any[] = [];
  let categories: any[] = [];
  let items: any[] = [];
  let sequence = 0;
  const imageIds = new Set<string>();
  const photo = `data:image/jpeg;base64,${jpeg.encode({ width: 2, height: 2, data: Buffer.from(Array(4).fill([211, 164, 74, 255]).flat()) }, 80).data.toString('base64')}`;
  function nextId() { sequence++; return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`; }
  function publicItems(collectionId: string) { return items.filter(item => item.collection_id === collectionId && item.visibility === 'public'); }
  function publicCard(collection: any) {
    const visible = publicItems(collection.id);
    return { id: collection.id, name: collection.name, itemCount: visible.length, coverItemId: visible.find(item => imageIds.has(item.id))?.id ?? null, isOwner: true };
  }
  function topicKey(name: string) { return (name.toLowerCase().split(/[^a-z0-9]+/).filter(word => word && !['a', 'an', 'the', 'my', 'collection', 'collections'].includes(word)).map(word => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word).join(' ') || 'collection'); }

  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) { await route.fulfill({ status: 204 }); return; }
    if (path.endsWith('/user')) { await route.fulfill({ json: user }); return; }
    await route.fulfill({ json: { access_token: access, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user } });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const resource = url.pathname.split('/').at(-1)!;
    if(resource==='get_policy_acceptance') { await route.fulfill({json:{requiredVersion:'2026-10-04',acceptedVersion:accepted?'2026-10-04':null}});return; }
    if(resource==='accept_public_rules') {accepted=true;await route.fulfill({json:null});return;}
    if(resource==='list_owned_publications') {await route.fulfill({json:items.map(item=>({itemId:item.id,status:item.visibility==='private'?'private':'published',message:''}))});return;}
    if (resource === 'list_owned_collections') {
      const { p_search = '', p_visibility = null } = request.postDataJSON();
      const rows = collections.filter(collection => collection.name.toLowerCase().includes(p_search.toLowerCase())).map(collection => {
        const visible = items.filter(item => item.collection_id === collection.id && (!p_visibility || item.visibility === p_visibility));
        const latest = visible[0]?.created_at ?? null;
        return { id: collection.id, ownerId: owner, name: collection.name, description: collection.description, acquiredOn: collection.acquired_on, createdAt: collection.created_at, itemCount: visible.length, coverItemId: visible.find(item => imageIds.has(item.id))?.id ?? null, lastUploadedAt: latest };
      }).filter(row => !p_visibility || row.itemCount > 0);
      await route.fulfill({ json: { collections: rows } }); return;
    }
    if (resource === 'list_public_collections') {
      const { p_page = 0 } = request.postDataJSON(); const cards = collections.map(publicCard).filter(card => card.itemCount > 0);
      await route.fulfill({ json: { collections: cards.slice(p_page * 24, (p_page + 1) * 24), total: cards.length, hasMore: cards.length > (p_page + 1) * 24 } }); return;
    }
    if (resource === 'list_public_topics') {
      const { p_page = 0 } = request.postDataJSON(); const groups = new Map<string, any>();
      for (const collection of collections) {
        const card = publicCard(collection); if (!card.itemCount) continue;
        const key = topicKey(collection.name); const current = groups.get(key);
        if (current) { current.itemCount += card.itemCount; current.collectionCount += 1; }
        else groups.set(key, { key, name: collection.name, itemCount: card.itemCount, collectionCount: 1, coverItemId: card.coverItemId, coverCollectionId: card.coverItemId ? collection.id : null });
      }
      const topics = [...groups.values()]; await route.fulfill({ json: { topics: topics.slice(p_page * 24, (p_page + 1) * 24), total: topics.length, hasMore: topics.length > (p_page + 1) * 24 } }); return;
    }
    if (resource === 'get_public_topic') {
      const { p_topic_key, p_page = 0 } = request.postDataJSON(); const matches = items.filter(item => item.visibility === 'public' && topicKey(collections.find(collection => collection.id === item.collection_id)?.name ?? '') === p_topic_key);
      if (!matches.length) { await route.fulfill({ contentType: 'application/json', body: 'null' }); return; }
      const firstCollection = collections.find(collection => collection.id === matches[0].collection_id)!;
      const entries = matches.map(item => ({ id: item.id, title: item.title, hasPhoto: imageIds.has(item.id), collectionId: item.collection_id, collectionName: collections.find(collection => collection.id === item.collection_id)?.name ?? 'Collection' }));
      await route.fulfill({ json: { topic: { key: p_topic_key, name: firstCollection.name }, entries: entries.slice(p_page * 24, (p_page + 1) * 24), total: entries.length, hasMore: entries.length > (p_page + 1) * 24 } }); return;
    }
    if (resource === 'list_public_entries') {
      const { p_page = 0 } = request.postDataJSON();
      const cards = items.filter(item => item.visibility === 'public').map(item => ({
        id: item.id,
        title: item.title,
        hasPhoto: imageIds.has(item.id),
        collectionId: item.collection_id,
        collectionName: collections.find(collection => collection.id === item.collection_id)?.name ?? 'Collection',
      }));
      await route.fulfill({ json: { entries: cards.slice(p_page * 24, (p_page + 1) * 24), total: cards.length, hasMore: cards.length > (p_page + 1) * 24 } }); return;
    }
    if (resource === 'get_shared_collection') {
      const { p_collection_id, p_page = 0 } = request.postDataJSON(); const collection = collections.find(value => value.id === p_collection_id); const visible = collection ? publicItems(collection.id) : [];
      if (!collection || !visible.length) { await route.fulfill({ contentType: 'application/json', body: 'null' }); return; }
      const sharedCategories = categories.filter(category => category.collection_id === collection.id && visible.some(item => item.category_id === category.id)).map(category => ({ id: category.id, name: category.name }));
      await route.fulfill({ json: { collection: { id: collection.id, name: collection.name }, scope: { collectionId: collection.id, categoryId: null }, categories: sharedCategories, items: visible.slice(p_page * 24, (p_page + 1) * 24).map(item => ({ id: item.id, title: item.title, hasPhoto: imageIds.has(item.id), categoryId: item.category_id, categoryName: categories.find(category => category.id === item.category_id)?.name ?? null })), total: visible.length, hasMore: visible.length > (p_page + 1) * 24 } }); return;
    }
    if (resource === 'save_item_draft') {
      const body = request.postDataJSON();
      let collectionId = body.p_collection_id;
      if (body.p_new_collection_name) {
        const collection = { id: nextId(), owner_id: owner, name: body.p_new_collection_name, description: '', acquired_on: null, created_at: now };
        collections.push(collection); collectionId = collection.id;
      }
      if (!collectionId) {
        let general = collections.find(collection => collection.name.toLowerCase() === 'general');
        if (!general) { general = { id: nextId(), owner_id: owner, name: 'General', description: '', acquired_on: null, created_at: now }; collections.push(general); }
        collectionId = general.id;
      }
      let categoryId = body.p_category_id;
      if (body.p_new_category_name) { const category = { id: nextId(), owner_id: owner, collection_id: collectionId, name: body.p_new_category_name, description: '', acquired_on: null, created_at: now }; categories.push(category); categoryId = category.id; }
      const row = { id: nextId(), owner_id: owner, title: body.p_title, notes: body.p_notes, collection_id: collectionId, category_id: categoryId ?? null, visibility: body.p_visibility ?? 'private', acquired_on: body.p_acquired_on ?? null, created_at: now, updated_at: now };
      items.unshift(row); await route.fulfill({ json: row }); return;
    }
    if (resource === 'delete_category') {
      const { p_category_id } = request.postDataJSON(); categories = categories.filter(category => category.id !== p_category_id); items = items.map(item => item.category_id === p_category_id ? { ...item, category_id: null } : item);
      await route.fulfill({ json: null }); return;
    }
    const rows = resource === 'categories' ? categories : resource === 'collections' ? collections : items;
    const id = url.searchParams.get('id')?.replace('eq.', '');
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); const value = Array.isArray(body) ? body[0] : body;
      if (resource === 'items' && value.category_id && !categories.some(category => category.id === value.category_id && category.collection_id === value.collection_id)) { await route.fulfill({ status: 400, json: { message: 'Category must belong to the collection.' } }); return; }
      const row = { ...value, id: nextId(), owner_id: owner, created_at: now, updated_at: now };
      if (resource === 'categories') { row.description ??= ''; row.acquired_on ??= null; categories.push(row); }
      else if (resource === 'collections') { row.acquired_on ??= '2026-01-01'; collections.push(row); }
      else { row.category_id ??= null; row.visibility ??= 'private'; items.unshift(row); }
      await route.fulfill({ json: row }); return;
    }
    if (request.method() === 'PATCH') {
      const row = rows.find(value => value.id === id);
      const value = request.postDataJSON();
      if (!row) { await route.fulfill({ status: 404, json: { message: 'Missing row' } }); return; }
      const next = { ...row, ...value, updated_at: now };
      if (resource === 'items' && next.category_id && !categories.some(category => category.id === next.category_id && category.collection_id === next.collection_id)) { await route.fulfill({ status: 400, json: { message: 'Category must belong to the collection.' } }); return; }
      Object.assign(row, next); await route.fulfill({ json: row }); return;
    }
    if (request.method() === 'DELETE') { await route.fulfill({ status: 204 }); return; }
    let result = [...rows];
    const collectionId = url.searchParams.get('collection_id')?.replace('eq.', '');
    const categoryId = url.searchParams.get('category_id')?.replace('eq.', '');
    const visibility = url.searchParams.get('visibility')?.replace('eq.', '');
    if (collectionId) result = result.filter(value => value.collection_id === collectionId);
    if (categoryId) result = result.filter(value => value.category_id === categoryId);
    if (visibility) result = result.filter(value => value.visibility === visibility);
    const search = url.searchParams.get('title')?.replace('ilike.%', '').replace(/%$/, ''); if (search) result = result.filter(value => value.title.toLowerCase().includes(search.toLowerCase()));
    await route.fulfill({ json: result, headers: { 'content-range': `0-${Math.max(0, result.length - 1)}/${result.length}` } });
  });
  await page.route('**/functions/v1/media', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'upload') { imageIds.add(body.itemId); await route.fulfill({ json: { ok: true } }); return; }
    if (body.action === 'read') { await route.fulfill({ json: { images: body.itemIds.filter((id: string) => imageIds.has(id)).map((itemId: string) => ({ itemId, url: photo, thumbnailUrl: photo, expiresAt: '2099-01-01T00:00:00Z' })) } }); return; }
    if (body.action === 'delete-item') { items = items.filter(item => item.id !== body.itemId); imageIds.delete(body.itemId); }
    if (body.action === 'delete-collection') { items = items.filter(item => item.collection_id !== body.collectionId); categories = categories.filter(category => category.collection_id !== body.collectionId); collections = collections.filter(collection => collection.id !== body.collectionId); }
    await route.fulfill({ json: { ok: true } });
  });
  return { collections: () => collections, categories: () => categories, items: () => items };
}

async function signIn(page: Page) {
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('a fresh account can add an item with an inline collection and defaults entries to private', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Requires fixture backend export.');
  const state = await fakeBackend(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'My collections', exact: true }).click();
  await expect(page.getByText('No entries yet.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
  await page.getByLabel('Item name').fill('Blue cap');
  await page.getByRole('button', { name: 'Collection: New collection', exact: true }).click();
  await page.getByLabel('New collection name').fill('Bottle Caps');
  await expect(page.getByRole('button', { name: 'Visibility: Private', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox',{name:'Agree to Terms and Community rules'}).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Blue cap', exact: true })).toBeVisible();
  expect(state.collections()).toHaveLength(1); expect(state.categories()).toHaveLength(0);
  expect(state.items()[0]).toMatchObject({ collection_id: state.collections()[0].id, category_id: null, visibility: 'private' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('categories are nested below their collection and sibling entries can have mixed visibility', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true', 'Requires fixture backend export.');
  const state = await fakeBackend(page); await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'New collection', exact: true }).first().click(); await page.getByLabel('Collection name').fill('Pins'); await page.getByRole('checkbox',{name:'Agree to Terms and Community rules'}).click(); await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await page.getByRole('button', { name: 'New category', exact: true }).click(); await page.getByLabel('Category name').fill('Local breweries'); await page.getByRole('button', { name: 'Create category', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Local breweries', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click(); await page.getByLabel('Item name').fill('Private pin'); await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click(); await page.getByLabel('Item name').fill('Public pin'); await page.getByRole('button', { name: 'Visibility: Public', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
  expect(state.items().map(item => item.visibility).sort()).toEqual(['private', 'public']);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Public pin', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Private pin', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Explore collections', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Pins collection', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Pins collection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Public pin', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Private pin', exact: true })).toHaveCount(0);
});

test('demo stays local and uses the collection-first navigation on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await page.goto('/');
  if (process.env.PLAYWRIGHT_BACKEND_FIXTURE !== 'true') await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My collections', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Mountain pin', exact: true })).toBeVisible();
  await expect(page.getByText(/Small pins|Big memories|Every souvenir|ONLY YOU|YOUR PRIVATE COLLECTION/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'All collections', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('dark storefront keeps the promotional panel behind its light heading dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('collectibles.theme-preference', 'dark'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const panel = page.getByTestId('auth-landing-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('background-color', 'rgb(36, 54, 43)');
  await expect(page.getByText(/Every find has/)).toHaveCSS('color', 'rgb(241, 244, 237)');
});
