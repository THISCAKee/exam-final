import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { allQuestions, EXAM_DURATION_SECONDS } from '../app/lib/questions.ts';
import { gradeSubmission } from './grading.ts';
import { localDatabase } from './sqlite.ts';
import type { SqlConnection, SqlDatabase } from './sql.ts';

export class AttemptError extends Error { status = 409; }
export interface ExamIdentity { firstName: string; lastName: string; studentId: string; section: string }
export type FinishReason = 'completed' | 'timeout' | 'exited';
interface Row {
  id: string; token_hash: string; student_key: string; name_key: string;
  identity: string; question_order: string; answers: string; revision: number;
  deadline: number; last_seen: number; page_id: string | null;
  status: 'active' | FinishReason; finished_at: number | null; synced: number;
}
export const ATTEMPTS_SCHEMA = `CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
  student_key TEXT NOT NULL UNIQUE, name_key TEXT NOT NULL UNIQUE,
  identity TEXT NOT NULL, question_order TEXT NOT NULL, answers TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0, deadline INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  page_id TEXT, status TEXT NOT NULL DEFAULT 'active', finished_at INTEGER,
  synced INTEGER NOT NULL DEFAULT 0, sync_until INTEGER NOT NULL DEFAULT 0
)`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
const choices = new Set(['ก', 'ข', 'ค', 'ง', 'ไม่ได้ตอบ']);

export class AttemptsStore {
  private db: SqlDatabase;
  private ready?: Promise<void>;
  private queue: Promise<void> = Promise.resolve();
  constructor(database: string | SqlDatabase) {
    this.db = typeof database === 'string' ? localDatabase(database) : database;
  }
  close() { this.db.close?.(); }
  private async initialize() {
    if (!this.ready) {
      this.ready = (async () => {
        const c = await this.db.connect();
        try {
          await c.execute(ATTEMPTS_SCHEMA);
          await c.execute('CREATE INDEX IF NOT EXISTS attempts_pending ON attempts(status,synced,sync_until)');
        } finally { await c.close().catch(() => {}); }
      })().catch(error => { this.ready = undefined; throw error; });
    }
    await this.ready;
  }
  private async transaction<T>(run: (c: SqlConnection) => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      await this.initialize();
      const c = await this.db.connect();
      try {
        await c.execute('BEGIN IMMEDIATE');
        const result = await run(c);
        await c.execute('COMMIT');
        return result;
      } catch (error) {
        await c.execute('ROLLBACK').catch(() => {});
        throw error;
      } finally { await c.close().catch(() => {}); }
    } finally { release(); }
  }
  private async read(c: SqlConnection, token: string): Promise<Row> {
    if (typeof token !== 'string' || token.length > 200) throw new AttemptError('Invalid attempt token');
    const row = (await c.execute('SELECT * FROM attempts WHERE token_hash=?', [hash(token)])).rows[0];
    if (!row) throw new AttemptError('Invalid attempt token');
    return row as unknown as Row;
  }
  private snapshot(row: Row) {
    return { id: row.id, ...JSON.parse(row.identity) as ExamIdentity,
      questionOrder: JSON.parse(row.question_order) as number[], userAnswers: JSON.parse(row.answers) as string[],
      deadline: row.deadline, status: row.status, revision: row.revision, finishedAt: row.finished_at };
  }
  async inspect(token: string) { return this.transaction(async c => this.snapshot(await this.read(c, token))); }
  async start(identity: ExamIdentity, now = Date.now()) {
    const validated = gradeSubmission({ ...identity, questionOrder: allQuestions.map(q => q.id),
      userAnswers: Array(allQuestions.length).fill('ไม่ได้ตอบ') });
    const person: ExamIdentity = { firstName: validated.firstName, lastName: validated.lastName,
      studentId: validated.studentId, section: validated.section };
    const token = randomBytes(32).toString('hex');
    const id = randomUUID();
    const order = allQuestions.map(q => q.id);
    for (let i = order.length - 1; i > 0; i--) { const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const deadline = now + EXAM_DURATION_SECONDS * 1000;
    const studentKey = normalize(person.studentId);
    const nameKey = `${normalize(person.firstName)}\0${normalize(person.lastName)}`;
    await this.transaction(async c => {
      if ((await c.execute('SELECT id FROM attempts WHERE student_key=? OR name_key=?', [studentKey, nameKey])).rows.length) {
        throw new AttemptError('This name or student ID has already used its exam attempt');
      }
      await c.execute(`INSERT INTO attempts
        (id,token_hash,student_key,name_key,identity,question_order,answers,deadline,last_seen)
        VALUES (?,?,?,?,?,?,?,?,?)`, [id, hash(token), studentKey, nameKey, JSON.stringify(person),
          JSON.stringify(order), JSON.stringify(Array(allQuestions.length).fill('ไม่ได้ตอบ')), deadline, now]);
    });
    return { id, token, deadline };
  }
  private async end(c: SqlConnection, row: Row, reason: FinishReason, now: number) {
    await c.execute("UPDATE attempts SET status=?,finished_at=? WHERE id=? AND status='active'", [reason, now, row.id]);
  }
  private checkOwner(row: Row, pageId: string) {
    if (typeof pageId !== 'string' || !pageId || pageId.length > 100 || row.page_id !== pageId) throw new AttemptError('Invalid exam page');
  }
  async claim(token: string, pageId: string, now = Date.now()) {
    if (typeof pageId !== 'string' || !pageId || pageId.length > 100) throw new AttemptError('Invalid exam page');
    const result = await this.transaction(async c => {
      const row = await this.read(c, token);
      if (row.status !== 'active') return null;
      if (now >= row.deadline) { await this.end(c, row, 'timeout', now); return null; }
      if ((row.page_id && row.page_id !== pageId) || now - row.last_seen >= 60000) {
        await this.end(c, row, 'exited', now); return null;
      }
      await c.execute('UPDATE attempts SET page_id=?,last_seen=? WHERE id=?', [pageId, now, row.id]);
      return this.snapshot(await this.read(c, token));
    });
    if (!result) throw new AttemptError('This exam attempt has ended');
    return result;
  }
  private async updateAnswers(c: SqlConnection, row: Row, answers: unknown, revision: unknown, now: number) {
    if (!Array.isArray(answers) || answers.length !== allQuestions.length || !answers.every(a => typeof a === 'string' && choices.has(a)) ||
        typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) throw new AttemptError('Invalid answers');
    if (revision > row.revision) await c.execute('UPDATE attempts SET answers=?,revision=?,last_seen=? WHERE id=?', [JSON.stringify(answers), revision, now, row.id]);
    else await c.execute('UPDATE attempts SET last_seen=? WHERE id=?', [now, row.id]);
  }
  async save(token: string, pageId: string, answers: unknown, revision: unknown, now = Date.now()) {
    const result = await this.transaction(async c => {
      const row = await this.read(c, token); this.checkOwner(row, pageId);
      if (row.status !== 'active') return null;
      if (now >= row.deadline) { await this.end(c, row, 'timeout', now); return null; }
      if (now - row.last_seen >= 60000) { await this.end(c, row, 'exited', now); return null; }
      await this.updateAnswers(c, row, answers, revision, now);
      return this.snapshot(await this.read(c, token));
    });
    if (!result) throw new AttemptError('This exam attempt has ended');
    return result;
  }
  async finish(token: string, pageId: string, reason: FinishReason, answers: unknown, revision: unknown, now = Date.now()) {
    return this.transaction(async c => {
      const row = await this.read(c, token); this.checkOwner(row, pageId);
      if (row.status === 'active') {
        const expired = now >= row.deadline, disconnected = now - row.last_seen >= 60000;
        if (!expired && !disconnected) await this.updateAnswers(c, row, answers, revision, now);
        await this.end(c, row, expired ? 'timeout' : disconnected ? 'exited' : reason, now);
      }
      return this.snapshot(await this.read(c, token));
    });
  }
  async expire(now = Date.now()) {
    await this.transaction(async c => {
      await c.execute(`UPDATE attempts SET status=CASE WHEN deadline<=? THEN 'timeout' ELSE 'exited' END,
        finished_at=? WHERE status='active' AND (deadline<=? OR last_seen<=?)`, [now, now, now, now - 60000]);
    });
  }
  async pending() {
    return this.transaction(async c => (await c.execute("SELECT * FROM attempts WHERE status<>'active' AND synced=0 LIMIT 20")).rows
      .map(row => this.snapshot(row as unknown as Row)));
  }
  async claimDelivery(id: string, now = Date.now()) {
    return this.transaction(async c => (await c.execute('UPDATE attempts SET sync_until=? WHERE id=? AND synced=0 AND sync_until<=?', [now + 120000, id, now])).changes === 1);
  }
  async markSynced(id: string) { await this.transaction(async c => { await c.execute('UPDATE attempts SET synced=1 WHERE id=?', [id]); }); }
  async retryDelivery(id: string) { await this.transaction(async c => { await c.execute('UPDATE attempts SET sync_until=? WHERE id=?', [Date.now() + 30000, id]); }); }
}
