import type { sheets_v4 } from 'googleapis';
import { allQuestions } from '../app/lib/questions.ts';
import { appendResult, checkSheetEligibility, type SheetConfig } from './sheets.ts';
import { buildResultRow, gradeSubmission } from './grading.ts';
import { createSheetSession, readSheetSession, SessionError } from './sheet-session.ts';

// The signed session travels with requests, so different Vercel instances need no shared database.
export class SheetExam {
  constructor(privateSheets: sheets_v4.Sheets, config: SheetConfig, secret: string) {
    this.sheets = privateSheets; this.config = config; this.secret = secret;
  }
  private sheets: sheets_v4.Sheets;
  private config: SheetConfig;
  private secret: string;
  async start(identity: unknown, now = Date.now()) {
    const session = createSheetSession(identity, this.secret, now);
    await checkSheetEligibility(this.sheets, this.config, session);
    return { token: session.token, deadline: session.deadline };
  }
  claim(token: unknown, now = Date.now()) {
    const session = readSheetSession(token, this.secret);
    if (now >= session.deadline) throw new SessionError('หมดเวลาสอบแล้ว');
    return { ...session, userAnswers: Array(allQuestions.length).fill('ไม่ได้ตอบ'), revision: 0, status: 'active' };
  }
  async finish(token: unknown, answers: unknown, reason: 'completed' | 'exited', now = Date.now()) {
    const session = readSheetSession(token, this.secret);
    // Allow the normal network delay of an automatic timeout submission.
    if (now > session.deadline + 60000) throw new SessionError('หมดเวลารับคำตอบแล้ว');
    const result = gradeSubmission({ ...session, userAnswers: answers });
    const status = now >= session.deadline ? 'timeout' : reason;
    if (!await checkSheetEligibility(this.sheets, this.config, session, session.id)) {
      await appendResult(this.sheets, this.config, buildResultRow(result, new Date(now).toISOString()), session.id);
    }
    return { status };
  }
}
