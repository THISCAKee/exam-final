import 'server-only';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { google } from 'googleapis';
import { AttemptsStore } from './attempts';
import { TursoDatabase } from './turso';
import { gradeSubmission, buildResultRow } from './grading';
import { appendResult } from './sheets';

const state = globalThis as typeof globalThis & {
  examAttempts?: AttemptsStore;
  examSweep?: ReturnType<typeof setInterval>;
  examSyncing?: boolean;
};

export async function attempts() {
  if (!state.examAttempts) {
    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;
    if (url && token) {
      state.examAttempts = new AttemptsStore(new TursoDatabase(url, token));
    } else {
      // Vercel must never silently create an ephemeral local database.
      if (process.env.VERCEL || url || token) throw new Error('Turso database configuration is required');
      const path = resolve(process.env.EXAM_DB_PATH || '.data/exam.sqlite');
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      state.examAttempts = new AttemptsStore(path);
    }
  }
  await state.examAttempts.expire();
  if (!process.env.VERCEL && !state.examSweep) {
    state.examSweep = setInterval(() => {
      void maintenance().catch(() => console.error('Exam maintenance will retry'));
    }, 15000);
    state.examSweep.unref();
  }
  return state.examAttempts;
}

export async function maintenance() {
  const store = await attempts();
  await store.expire();
  await syncResults();
}

export async function syncResults() {
  if (state.examSyncing || !state.examAttempts) return;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const worksheetId = Number(process.env.GOOGLE_SHEET_GID);
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!spreadsheetId || !process.env.GOOGLE_SHEET_GID || !Number.isInteger(worksheetId) || !email || !privateKey) return;
  state.examSyncing = true;
  try {
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    // Bound each invocation; subsequent requests and cron continue the queue.
    for (const result of await state.examAttempts.pending()) {
      if (!await state.examAttempts.claimDelivery(result.id)) continue;
      try {
        const graded = gradeSubmission(result);
        await appendResult(sheets, { spreadsheetId, worksheetId },
          buildResultRow(graded, new Date(result.finishedAt!).toISOString()), result.id);
        await state.examAttempts.markSynced(result.id);
      } catch {
        await state.examAttempts.retryDelivery(result.id);
        console.error('Exam result queued for Google Sheets retry');
      }
    }
  } finally { state.examSyncing = false; }
}
