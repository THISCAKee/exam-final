import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { TursoDatabase } from '../src/server/turso.ts';
import { ATTEMPTS_SCHEMA } from '../src/server/attempts.ts';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error('Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first');
const local = new DatabaseSync(resolve(process.env.EXAM_DB_PATH || '.data/exam.sqlite'), { readOnly: true });
const rows = local.prepare('SELECT * FROM attempts').all();
local.close();
const db = new TursoDatabase(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
const c = await db.connect();
const fields = ['id','token_hash','student_key','name_key','identity','question_order','answers','revision','deadline','last_seen','page_id','status','finished_at','synced','sync_until'];
try {
  await c.execute(ATTEMPTS_SCHEMA);
  for (const row of rows) {
    // Preserve original IDs and locks. Fail on a conflicting name or student ID.
    await c.execute(`INSERT INTO attempts (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')}) ON CONFLICT(id) DO NOTHING`, fields.map(name=>row[name]));
  }
  const count = await c.execute('SELECT COUNT(*) AS count FROM attempts');
  console.log(`Migration finished. Local records: ${rows.length}; remote records: ${count.rows[0].count}. Local data retained.`);
} finally { await c.close(); }
