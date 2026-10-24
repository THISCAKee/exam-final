import 'server-only';
import { google } from 'googleapis';
import { SheetExam } from './sheet-exam';

export function sheetExam() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const gid = process.env.GOOGLE_SHEET_GID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!spreadsheetId || !gid || !Number.isInteger(Number(gid)) || !email || !privateKey) {
    throw new Error('Google Sheets configuration is required');
  }
  const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return new SheetExam(google.sheets({ version: 'v4', auth }),
    { spreadsheetId, worksheetId: Number(gid) }, privateKey);
}
