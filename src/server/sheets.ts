import type { sheets_v4 } from 'googleapis';
import { resultHeaders } from './grading.ts';

export interface SheetConfig {
  spreadsheetId: string;
  worksheetId: number;
}

export async function appendResult(
  sheets: sheets_v4.Sheets,
  config: SheetConfig,
  row: (string | number)[],
  attemptId?: string,
) {
  const { spreadsheetId, worksheetId } = config;
  const headers = attemptId ? [...resultHeaders, 'AttemptID'] : resultHeaders;
  const lastColumn = attemptId ? 'CI' : 'CH';
  const values = attemptId ? [...row, attemptId] : row;
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title,gridProperties.columnCount)',
  });
  const target = metadata.data.sheets?.find(s => s.properties?.sheetId === worksheetId)?.properties;
  if (!target?.title) throw new Error('Configured worksheet gid was not found');
  const tab = `'${target.title.replace(/'/g, "''")}'`;
  // Read only the current grid width; the existing 60-question sheet has 66 columns.
  const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` });
  const existing = headerResponse.data.values?.[0] ?? [];
  if (existing.some((value, i) => value !== '' && value !== headers[i])) {
    throw new Error('Worksheet headers do not match the exam results schema');
  }
  if ((target.gridProperties?.columnCount ?? 0) < headers.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{
      updateSheetProperties: {
        properties: { sheetId: worksheetId, gridProperties: { columnCount: headers.length } },
        fields: 'gridProperties.columnCount',
      },
    }] } });
  }
  if (headers.some((value, i) => existing[i] !== value)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tab}!A1:${lastColumn}1`, valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
  if (attemptId) {
    const saved = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!CI2:CI` });
    const index = saved.data.values?.findIndex(value => value[0] === attemptId) ?? -1;
    if (index >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${tab}!A${index + 2}:CI${index + 2}`,
        valueInputOption: 'RAW', requestBody: { values: [values] },
      }, { retry: false, timeout: 30000 });
      return;
    }
  }
  // RAW preserves leading zeros in IDs and treats user input as text, not formulas.
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: `${tab}!A:${lastColumn}`,
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  }, { retry: false, timeout: 30000 });
}
