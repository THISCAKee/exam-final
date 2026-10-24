import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from './sql.ts';

export function localDatabase(path: string): SqlDatabase {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  return {
    connect: async () => ({
      execute: async (sql: string, args: SqlValue[] = []) => {
        const rows = db.prepare(sql).all(...args) as Record<string, SqlValue>[];
        const changed = db.prepare('SELECT changes() AS count').get() as { count: number };
        return { rows, changes: changed.count };
      },
      close: async () => {},
    }),
    close: () => db.close(),
  };
}
