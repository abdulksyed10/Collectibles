import { readFile, readdir } from 'node:fs/promises';

export async function applyMigrations(db: { exec(sql: string): Promise<unknown> }, after = '', through = '~') {
  const directory = 'supabase/migrations';
  for (const filename of (await readdir(directory)).filter(name => name.endsWith('.sql') && name > after && name <= through).sort()) {
    await db.exec(await readFile(`${directory}/${filename}`, 'utf8'));
  }
}
