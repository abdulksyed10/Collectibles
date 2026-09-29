import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000803';
let db: PGlite;

before(async () => {
  db = await createHierarchyFixture();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
  await asOwner(db, owner, async () => {
    const pins = (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('Pins','') RETURNING id")).rows[0]!.id;
    const myPins = (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('My pins','') RETURNING id")).rows[0]!.id;
    const cards = (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('Pokémon cards','') RETURNING id")).rows[0]!.id;
    await db.query("INSERT INTO items(collection_id,title,visibility) VALUES ($1,'Park pin','public'),($2,'Gift pin','public'),($2,'Private pin','private'),($3,'Rare card','public')", [pins, myPins, cards]);
  });
});
after(async () => db?.close());

test('public topic cards combine similar collection names without changing the original collections', async () => {
  await db.exec('SET ROLE anon;');
  try {
    const page = (await db.query<{ list_public_topics: { topics: Array<{ key: string; name: string; itemCount: number; collectionCount: number }> } }>('SELECT public.list_public_topics(0)')).rows[0]!.list_public_topics;
    assert.deepEqual(page.topics.map(topic => ({ key: topic.key, name: topic.name, itemCount: topic.itemCount, collectionCount: topic.collectionCount })), [
      { key: 'pokémon card', name: 'Pokémon cards', itemCount: 1, collectionCount: 1 },
      { key: 'pin', name: 'Pins', itemCount: 2, collectionCount: 2 },
    ]);
  } finally { await db.exec('RESET ROLE;'); }
});

test('a topic returns only public entries and preserves the source collection for the full collection link', async () => {
  await db.exec('SET ROLE anon;');
  try {
    const page = (await db.query<{ get_public_topic: { topic: { key: string; name: string }; entries: Array<{ title: string; collectionName: string }> } }>("SELECT public.get_public_topic('pin', 0)")).rows[0]!.get_public_topic;
    assert.deepEqual(page.topic, { key: 'pin', name: 'Pins' });
    assert.deepEqual(page.entries.map(entry => entry.title).sort(), ['Gift pin', 'Park pin']);
    assert.deepEqual(page.entries.map(entry => entry.collectionName).sort(), ['My pins', 'Pins']);
  } finally { await db.exec('RESET ROLE;'); }
});
