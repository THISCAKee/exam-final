import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { SheetEligibilityError } from './sheets';
import { SessionError } from './sheet-session';
import { SubmissionValidationError } from './grading';
import { sheetExam } from './sheet-exam-service';

type Action = 'start' | 'claim' | 'exit' | 'submit';
export async function attemptAction(req: NextRequest, action: Action) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return NextResponse.json({error:'Forbidden'}, {status:403});
    let data;
    try { data = await req.json(); }
    catch { return NextResponse.json({ error: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 }); }
    if (!data || typeof data !== 'object') return NextResponse.json({error:'ข้อมูลไม่ถูกต้อง'}, {status:400});
    const store = sheetExam();
    let result;
    switch (action) {
      case 'start': result = await store.start(data); break;
      case 'claim': result = store.claim(data.token); break;
      case 'exit':
      case 'submit':
        result = await store.finish(data.token, data.userAnswers, action === 'exit' ? 'exited' : 'completed');
        break;
    }
    return NextResponse.json({ success: true, attempt: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SheetEligibilityError || error instanceof SessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SubmissionValidationError) return NextResponse.json({error:error.message}, {status:400});
    console.error('Attempt request failed');
    return NextResponse.json({ error: 'ติดต่อ Google Sheets ไม่สำเร็จ กรุณาลองอีกครั้งหรือติดต่อผู้คุมสอบ' }, { status: 503 });
  }
}
