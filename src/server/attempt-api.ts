import 'server-only';
import { after, NextRequest, NextResponse } from 'next/server';
import { AttemptError } from './attempts';
import { SubmissionValidationError } from './grading';
import { attempts, syncResults } from './exam-service';

type Action = 'start' | 'claim' | 'save' | 'exit' | 'submit';
export async function attemptAction(req: NextRequest, action: Action) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return NextResponse.json({error:'Forbidden'}, {status:403});
    let data;
    try { data = await req.json(); }
    catch { return NextResponse.json({ error: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 }); }
    if (!data || typeof data !== 'object') return NextResponse.json({error:'ข้อมูลไม่ถูกต้อง'}, {status:400});
    const store = await attempts();
    let result;
    switch (action) {
      case 'start': result = await store.start(data); break;
      case 'claim': result = await store.claim(data.token, data.pageId); break;
      case 'save': result = await store.save(data.token, data.pageId, data.userAnswers, data.revision); break;
      case 'exit':
      case 'submit':
        result = await store.finish(data.token, data.pageId, action === 'exit' ? 'exited' : 'completed', data.userAnswers, data.revision);
        break;
    }
    // A durable result is final even if Google Sheets needs a retry.
    after(async () => { await syncResults(); });
    return NextResponse.json({ success: true, attempt: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AttemptError) {
      return NextResponse.json({ error: 'ชื่อ–นามสกุลหรือรหัสนิสิตนี้ใช้สิทธิ์สอบแล้ว หรือรอบสอบสิ้นสุดแล้ว ไม่สามารถเข้าสอบใหม่ได้' }, { status: error.status });
    }
    if (error instanceof SubmissionValidationError) return NextResponse.json({error:error.message}, {status:400});
    console.error('Attempt request failed');
    return NextResponse.json({ error: 'ระบบบันทึกสิทธิ์สอบไม่พร้อมใช้งาน กรุณาติดต่อผู้คุมสอบ' }, { status: 503 });
  }
}
