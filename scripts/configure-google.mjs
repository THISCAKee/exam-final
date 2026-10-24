import { readFile, writeFile } from 'node:fs/promises';

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('Usage: node scripts/configure-google.mjs /absolute/path/service-account.json');
  process.exit(1);
}
const key = JSON.parse(await readFile(keyPath, 'utf8'));
if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
  throw new Error('Expected a Google service account JSON key');
}
const env = [
  'GOOGLE_SHEET_ID=13NQODP2AuJpSjrlBAYSP1Nn2qDJ7XfA-HYUEqviODnE',
  'GOOGLE_SHEET_GID=1872488623',
  'EXAM_DB_PATH=.data/exam.sqlite',
  `GOOGLE_SERVICE_ACCOUNT_EMAIL=${key.client_email}`,
  `GOOGLE_PRIVATE_KEY=${JSON.stringify(key.private_key)}`,
].join('\n')+'\n';
await writeFile(new URL('../.env.local', import.meta.url), env, { mode: 0o600 });
console.log('Saved .env.local. Share the spreadsheet as Editor with: '+key.client_email);
console.log('Restart the development server after changing environment variables.');
