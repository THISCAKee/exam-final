"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { allQuestions, optionKeys } from '../lib/questions';
import { ATTEMPT_TOKEN_KEY, examRequest, ExamRequestError, type ExamSession } from '../lib/exam-session';

export default function ExamPage() {
  const router = useRouter();
  const [session, setSession] = useState<ExamSession | null>(null);
  const active = useRef<ExamSession | null>(null);
  const pageId = useRef<string | null>(null);
  const finished = useRef(false);
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(3600);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const mounted = useRef(false);
  const autoSubmitted = useRef(false);
  const deadline = session?.deadline;

  const finish = useCallback(async () => {
    const current = active.current;
    if (!current || submitting.current || finished.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      const result = await examRequest<{ status: string }>('submit', current);
      finished.current = true;
      sessionStorage.removeItem(ATTEMPT_TOKEN_KEY);
      router.replace(`/done?status=${result.status}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ส่งคำตอบไม่สำเร็จ กรุณาลองอีกครั้ง');
      submitting.current = false;
      setIsSubmitting(false);
    }
  }, [router]);

  const save = useCallback(async () => {
    const current = active.current;
    if (!current || finished.current || submitting.current) return;
    try {
      await examRequest('save', current);
      if (mounted.current) setError('');
    } catch (cause) {
      if (!mounted.current || finished.current || submitting.current) return;
      if (cause instanceof ExamRequestError && cause.status === 409) {
        // Finalize idempotently to display the server's timeout/exit status.
        void finish();
      } else {
        setError('ยังบันทึกคำตอบล่าสุดไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต ระบบจะลองส่งอีกครั้ง');
      }
    }
  }, [finish]);

  useEffect(() => {
    mounted.current = true;
    pageId.current ??= crypto.randomUUID();
    const token = sessionStorage.getItem(ATTEMPT_TOKEN_KEY);
    if (!token) { router.replace('/'); return; }
    // Repeated initialization by React Strict Mode uses the same page ID.
    void examRequest<Omit<ExamSession, 'token' | 'pageId'>>('claim', { token, pageId: pageId.current })
      .then(result => {
        if (!mounted.current || active.current) return;
        const next = { ...result, token, pageId: pageId.current! };
        active.current = next;
        setSession(next);
        setRemaining(Math.max(0, Math.ceil((next.deadline - Date.now()) / 1000)));
      }).catch(cause => {
        if (!mounted.current) return;
        setError(cause instanceof Error ? cause.message : 'ไม่สามารถเข้าสอบได้');
        setBlocked(true);
      });
    const leave = () => {
      const current = active.current;
      if (!current || finished.current || submitting.current) return;
      // This reserves no new attempt. The server already locked eligibility at start.
      const data = JSON.stringify(current);
      if (!navigator.sendBeacon('/api/attempts/exit', new Blob([data], { type: 'application/json' }))) {
        void fetch('/api/attempts/exit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true });
      }
    };
    window.addEventListener('pagehide', leave);
    const restored = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pageshow', restored);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restored);
      // Strict Mode remounts immediately; only a real SPA departure ends the attempt.
      queueMicrotask(() => { if (!mounted.current) leave(); });
    };
  }, [router]);

  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !autoSubmitted.current) { autoSubmitted.current = true; void finish(); }
    }, 1000);
    const heartbeat = setInterval(() => { void save(); }, 15000);
    return () => { clearInterval(timer); clearInterval(heartbeat); };
  }, [deadline, finish, save]);

  const select = (choice: string) => {
    const current = active.current;
    if (!current || Date.now() >= current.deadline || finished.current || submitting.current) return;
    const answers = [...current.userAnswers];
    answers[index] = choice;
    const next = { ...current, userAnswers: answers, revision: current.revision + 1 };
    active.current = next;
    setSession(next);
    void save();
  };

  if (blocked) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-black bg-gray-100"><p role="alert">{error}</p><button className="rounded bg-indigo-600 px-5 py-3 text-white" onClick={() => router.replace('/')}>กลับหน้าแรก</button></main>;
  if (!session) return <main className="flex min-h-screen items-center justify-center">กำลังตรวจสอบสิทธิ์สอบ...</main>;
  if (isSubmitting) return <main className="flex min-h-screen items-center justify-center">กำลังบันทึกผลสอบ...</main>;
  const question = allQuestions.find(q => q.id === session.questionOrder[index])!;
  const selected = session.userAnswers[index];
  return (
    <div className="min-h-screen bg-gray-100 text-black">
      <header className="sticky top-0 z-10 bg-white p-4 shadow-md">
        <div className="container mx-auto flex flex-wrap justify-between gap-2 font-bold">
          <h1>ข้อ {index + 1} / {session.questionOrder.length}</h1>
          <p className="text-red-600">เวลาที่เหลือ: {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</p>
        </div>
      </header>
      <main className="container mx-auto p-4 sm:p-6">
        <p className="mb-4 text-sm text-red-700">ปิดหน้าเว็บหรือรีเฟรชถือว่าสิ้นสุดการสอบ และไม่สามารถเข้าสอบใหม่ได้</p>
        {error && <div role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800"><p>{error}</p><button className="mt-2 rounded bg-indigo-600 px-4 py-2 text-white" onClick={() => void finish()}>ส่งคำตอบอีกครั้ง</button></div>}
        <div className="rounded-lg bg-white p-5 shadow-lg sm:p-8">
          <h2 className="mb-6 text-xl font-semibold">{question.question}</h2>
          <div className="space-y-4">
            {question.options.map((option, i) => (
              <label key={i} className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${selected === optionKeys[i] ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300'}`}>
                <input type="radio" name="option" value={optionKeys[i]} checked={selected === optionKeys[i]} disabled={remaining <= 0} onChange={() => select(optionKeys[i])} />
                <span><strong>{optionKeys[i]}.</strong> {option}</span>
              </label>
            ))}
          </div>
          <button className="mt-8 w-full rounded-lg bg-indigo-600 px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400" disabled={selected === 'ไม่ได้ตอบ' || remaining <= 0} onClick={() => {
            if (index === session.questionOrder.length - 1) void finish();
            else setIndex(index + 1);
          }}>{index === session.questionOrder.length - 1 ? 'ส่งคำตอบ' : 'ข้อถัดไป'}</button>
        </div>
      </main>
    </div>
  );
}
