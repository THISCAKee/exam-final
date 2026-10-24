import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { allQuestions, EXAM_DURATION_SECONDS } from '../app/lib/questions.ts';
import { gradeSubmission } from './grading.ts';

export class SessionError extends Error { status = 409; }
export interface SheetSession {
  id: string; firstName: string; lastName: string; studentId: string; section: string;
  questionOrder: number[]; deadline: number;
}
export function createSheetSession(identity: unknown, secret: string, now = Date.now()) {
  const graded = gradeSubmission({ ...(identity as object), questionOrder: allQuestions.map(q => q.id),
    userAnswers: Array(allQuestions.length).fill('ไม่ได้ตอบ') });
  const questionOrder = allQuestions.map(q => q.id);
  for (let i = questionOrder.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [questionOrder[i], questionOrder[j]] = [questionOrder[j], questionOrder[i]];
  }
  const session: SheetSession = { id: randomUUID(), firstName: graded.firstName, lastName: graded.lastName,
    studentId: graded.studentId, section: graded.section, questionOrder, deadline: now + EXAM_DURATION_SECONDS * 1000 };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`sheet-exam-v1:${payload}`).digest('base64url');
  return { ...session, token: `${payload}.${signature}` };
}
export function readSheetSession(token: unknown, secret: string): SheetSession {
  if (typeof token !== 'string' || token.length > 10000) throw new SessionError('ข้อมูลการสอบไม่ถูกต้อง');
  const parts = token.split('.');
  if (parts.length !== 2) throw new SessionError('ข้อมูลการสอบไม่ถูกต้อง');
  const [payload, signature] = parts;
  const expected = createHmac('sha256', secret).update(`sheet-exam-v1:${payload}`).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new SessionError('ข้อมูลการสอบไม่ถูกต้อง');
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()) as SheetSession; }
  catch { throw new SessionError('ข้อมูลการสอบไม่ถูกต้อง'); }
}
