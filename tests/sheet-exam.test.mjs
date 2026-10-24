import assert from 'node:assert/strict';
import test from 'node:test';
import { resultHeaders } from '../src/server/grading.ts';
import * as sheetsModule from '../src/server/sheets.ts';

const config = { spreadsheetId: 'exam', worksheetId: 7 };
const identity = { firstName: 'สมชาย', lastName: 'ใจดี', studentId: '00123', section: '3' };
function sheet(rows = [], { gid = 7, fail = false } = {}) {
  return { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: gid, title: "Exam's", gridProperties: { columnCount: 87 } } }] } }),
    values: { get: async ({ range }) => {
      if (fail) throw new Error('Google unavailable');
      assert.equal(range, "'Exam''s'!A:CI");
      return { data: { values: [[...resultHeaders, 'AttemptID'], ...rows] } };
    } },
  } };
}
const row = (first, last, id, attempt = '') => ['time', first, last, id, '3', 0, ...Array(80).fill('ไม่ได้ตอบ'), attempt];
const examModule = await import('../src/server/sheet-session.ts').catch(() => ({}));

test('signed sessions work across server instances and reject tampering', () => {
  assert.equal(typeof examModule.createSheetSession, 'function');
  const session = examModule.createSheetSession(identity, 'secret', 1000);
  const claimed = examModule.readSheetSession(session.token, 'secret');
  assert.equal(claimed.studentId, '00123');
  assert.equal(claimed.deadline, 3601000);
  assert.equal(new Set(claimed.questionOrder).size, 80);
  assert.throws(() => examModule.readSheetSession(session.token + 'x', 'secret'));
  assert.throws(() => examModule.readSheetSession(session.token, 'another-secret'));
});
test('session signature protects identity, question order and deadline', () => {
  assert.equal(typeof examModule.createSheetSession, 'function');
  const { token } = examModule.createSheetSession(identity, 'secret', 1000);
  const [payload, signature] = token.split('.');
  const changed = JSON.parse(Buffer.from(payload, 'base64url').toString());
  changed.studentId = '999';
  changed.deadline += 100000;
  const forged = Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + signature;
  assert.throws(() => examModule.readSheetSession(forged, 'secret'));
});

test('sheet eligibility rejects a matching student ID even with a different name', async () => {
  assert.equal(typeof sheetsModule.checkSheetEligibility, 'function');
  await assert.rejects(() => sheetsModule.checkSheetEligibility(sheet([row('อื่น', 'คนอื่น', '00123')]), config, identity), /ใช้สิทธิ์สอบแล้ว/);
});
test('sheet eligibility rejects normalized full names even with a different ID', async () => {
  assert.equal(typeof sheetsModule.checkSheetEligibility, 'function');
  await assert.rejects(() => sheetsModule.checkSheetEligibility(sheet([row(' สม ชาย ', 'ใจดี ', '999')]), config, identity), /ใช้สิทธิ์สอบแล้ว/);
});
test('same first name with a different surname and ID remains eligible', async () => {
  assert.equal(typeof sheetsModule.checkSheetEligibility, 'function');
  assert.equal(await sheetsModule.checkSheetEligibility(sheet([row('สมชาย', 'คนอื่น', '999')]), config, identity), false);
});
test('a retry recognizes its saved attempt without allowing another matching identity', async () => {
  assert.equal(typeof sheetsModule.checkSheetEligibility, 'function');
  assert.equal(await sheetsModule.checkSheetEligibility(sheet([row('สมชาย', 'ใจดี', '00123', 'attempt-1')]), config, identity, 'attempt-1'), true);
  await assert.rejects(() => sheetsModule.checkSheetEligibility(sheet([row('สมชาย', 'ใจดี', '00123', 'other')]), config, identity, 'attempt-1'), /ใช้สิทธิ์สอบแล้ว/);
});
test('sheet errors and missing gid fail closed', async () => {
  assert.equal(typeof sheetsModule.checkSheetEligibility, 'function');
  await assert.rejects(() => sheetsModule.checkSheetEligibility(sheet([], { fail: true }), config, identity), /Google unavailable/);
  await assert.rejects(() => sheetsModule.checkSheetEligibility(sheet([], { gid: 8 }), config, identity), /gid/);
});

function memorySheet() {
  const rows = [[...resultHeaders, 'AttemptID']];
  return { rows, client: { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: 7, title: 'Results', gridProperties: { columnCount: 87 } } }] } }),
    values: {
      get: async ({ range }) => ({ data: { values: range.endsWith('1:1') ? [rows[0]] : range.endsWith('CI2:CI') ? rows.slice(1).map(r => [r[86]]) : rows } }),
      append: async ({ requestBody }) => { rows.push(...requestBody.values); return { data: {} }; },
      update: async () => { throw new Error('A saved submission must not be overwritten'); },
    },
  } } };
}
const serviceModule = await import('../src/server/sheet-exam.ts').catch(() => ({}));
test('Sheets-only exam starts, claims on a fresh server, grades and blocks re-entry', async () => {
  assert.equal(typeof serviceModule.SheetExam, 'function');
  const { client, rows } = memorySheet();
  const firstServer = new serviceModule.SheetExam(client, config, 'secret');
  const started = await firstServer.start(identity, 1000);
  const secondServer = new serviceModule.SheetExam(client, config, 'secret');
  const claimed = secondServer.claim(started.token, 2000);
  const key = (await import('../src/server/answer-key.json', { with: { type: 'json' } })).default;
  const answers = claimed.questionOrder.map(id => key[id]);
  // Client identity, ordering and score are never used by finish; the signed token is authoritative.
  assert.deepEqual(await secondServer.finish(started.token, answers, 'completed', 3000), { status: 'completed' });
  assert.equal(rows[1][3], '00123');
  assert.equal(rows[1][5], 80);
  assert.equal(rows[1][6], key[1]);
  assert.equal(rows[1][85], key[80]);
  await assert.rejects(() => firstServer.start(identity, 4000), /ใช้สิทธิ์สอบแล้ว/);
  // Retrying after a lost HTTP response neither appends a duplicate nor overwrites answers.
  await secondServer.finish(started.token, Array(80).fill('ไม่ได้ตอบ'), 'completed', 4000);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][5], 80);
});
test('invalid answers, expired claims and late submissions cannot write results', async () => {
  assert.equal(typeof serviceModule.SheetExam, 'function');
  const { client, rows } = memorySheet();
  const exam = new serviceModule.SheetExam(client, config, 'secret');
  const { token } = await exam.start(identity, 1000);
  await assert.rejects(() => exam.finish(token, ['ก'], 'completed', 2000));
  assert.throws(() => exam.claim(token, 3601000), /หมดเวลา/);
  await assert.rejects(() => exam.finish(token, Array(80).fill('ก'), 'completed', 3661001), /หมดเวลา/);
  assert.equal(rows.length, 1);
});
test('timeout and departure write results before reporting success', async () => {
  assert.equal(typeof serviceModule.SheetExam, 'function');
  const { client, rows } = memorySheet();
  const exam = new serviceModule.SheetExam(client, config, 'secret');
  const { token } = await exam.start(identity, 1000);
  assert.deepEqual(await exam.finish(token, Array(80).fill('ไม่ได้ตอบ'), 'completed', 3601000), { status: 'timeout' });
  assert.equal(rows.length, 2);
  const next = await exam.start({ ...identity, firstName: 'คนอื่น', studentId: '999' }, 1000);
  assert.deepEqual(await exam.finish(next.token, Array(80).fill('ไม่ได้ตอบ'), 'exited', 2000), { status: 'exited' });
  assert.equal(rows.length, 3);
});
test('a failed Sheets write is reported as failure and a retry can succeed', async () => {
  assert.equal(typeof serviceModule.SheetExam, 'function');
  const { client, rows } = memorySheet();
  const exam = new serviceModule.SheetExam(client, config, 'secret');
  const { token } = await exam.start(identity, 1000);
  const append = client.spreadsheets.values.append;
  client.spreadsheets.values.append = async () => { throw new Error('Google unavailable'); };
  await assert.rejects(() => exam.finish(token, Array(80).fill('ก'), 'completed', 2000), /Google unavailable/);
  assert.equal(rows.length, 1);
  client.spreadsheets.values.append = append;
  await exam.finish(token, Array(80).fill('ก'), 'completed', 3000);
  assert.equal(rows.length, 2);
});
