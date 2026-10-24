import { allQuestions, optionKeys } from '../app/lib/questions.ts';
import answerKey from './answer-key.json' with { type: 'json' };

export class SubmissionValidationError extends Error {}

export interface GradedSubmission {
  firstName: string;
  lastName: string;
  studentId: string;
  section: string;
  score: number;
  answers: string[];
}

export const resultHeaders = [
  'Timestamp', 'FirstName', 'LastName', 'StudentID', 'Section', 'Score',
  ...allQuestions.map(q => `Q${q.id}`),
];

export function gradeSubmission(body: unknown): GradedSubmission {
  if (!body || typeof body !== 'object') {
    throw new SubmissionValidationError('ข้อมูลคำตอบไม่ถูกต้อง');
  }
  const data = body as Record<string, unknown>;
  const fields = ['firstName', 'lastName', 'studentId', 'section'] as const;
  for (const field of fields) {
    if (typeof data[field] !== 'string' || !data[field].trim() || data[field].length > 200) {
      throw new SubmissionValidationError('กรุณากรอกข้อมูลผู้สอบให้ครบถ้วน');
    }
  }
  const { questionOrder, userAnswers } = data;
  const ids = new Set(allQuestions.map(q => q.id));
  if (!Array.isArray(questionOrder) || !Array.isArray(userAnswers) ||
      questionOrder.length !== allQuestions.length || userAnswers.length !== allQuestions.length ||
      new Set(questionOrder).size !== allQuestions.length ||
      !questionOrder.every(id => Number.isInteger(id) && ids.has(id)) ||
      !userAnswers.every(a => typeof a === 'string' &&
        ([...optionKeys, 'ไม่ได้ตอบ'] as string[]).includes(a))) {
    throw new SubmissionValidationError('ต้องส่งคำตอบครบ 80 ข้อ โดยเลขข้อไม่ซ้ำและตัวเลือกถูกต้อง');
  }
  const byId = new Map<number, string>(questionOrder.map((id, i) => [id, userAnswers[i]]));
  const answers = allQuestions.map(q => byId.get(q.id)!);
  const keys = answerKey as Record<string, string>;
  const score = allQuestions.reduce((sum, q, i) => sum + Number(answers[i] === keys[q.id]), 0);
  return {
    firstName: (data.firstName as string).trim(),
    lastName: (data.lastName as string).trim(),
    studentId: (data.studentId as string).trim(),
    section: (data.section as string).trim(),
    score, answers,
  };
}

export function buildResultRow(result: GradedSubmission, timestamp: string) {
  return [timestamp, result.firstName, result.lastName, result.studentId,
    result.section, result.score, ...result.answers];
}
