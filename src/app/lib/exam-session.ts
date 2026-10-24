export const ATTEMPT_TOKEN_KEY = 'examAttemptToken';
export interface ExamSession {
  token: string;
  pageId: string;
  deadline: number;
  questionOrder: number[];
  userAnswers: string[];
  revision: number;
}
export class ExamRequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function examRequest<T>(action: string, payload: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  const path = action === 'submit' ? '/api/submit' : `/api/attempts/${action}`;
  const response = await fetcher(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok || data.success !== true) throw new ExamRequestError(data.error || 'ติดต่อระบบสอบไม่สำเร็จ', response.status);
  return data.attempt as T;
}
