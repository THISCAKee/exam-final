import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mod = await import('../src/server/attempts.ts').catch(()=>null);
const user={firstName:'สมชาย',lastName:'ทดสอบ',studentId:'00123',section:'01'};
function fixture(t){
  assert.ok(mod,'durable attempt store is required');
  const dir=mkdtempSync(join(tmpdir(),'exam-attempt-'));
  const path=join(dir,'attempts.sqlite');
  const store=new mod.AttemptsStore(path);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {store,path};
}
test('reserves the student ID even when a different name is supplied',async t=>{
  const {store}=fixture(t);await store.start(user,1000);
  await assert.rejects(async()=>store.start({...user,firstName:'คนอื่น'},1001),/already/);
});
test('reserves normalized full names even when a different ID is supplied',async t=>{
  const {store}=fixture(t);await store.start(user,1000);
  await assert.rejects(async()=>store.start({...user,firstName:' สมชาย ',studentId:'999'},1001),/already/);
});
test('different people can have the same first name',async t=>{
  const {store}=fixture(t);await store.start(user,1000);
  assert.ok((await store.start({...user,lastName:'อีกคน',studentId:'999'},1001)).token);
});
test('locks survive reopening the database and competing connections',async t=>{
  const {store,path}=fixture(t);await store.start(user,1000);
  const second=new mod.AttemptsStore(path);
  try{await assert.rejects(async()=>second.start(user,1002),/already/);}finally{second.close();}
});
test('an attempt token cannot be claimed by a second page',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);
  await store.claim(a.token,'page-one',1001);
  await store.claim(a.token,'page-one',1002); // Same request may be repeated safely.
  await assert.rejects(async()=>store.claim(a.token,'page-two',1003),/ended/);
  assert.equal((await store.inspect(a.token)).status,'exited');
});
test('saves answers by revision and ignores stale network responses',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);await store.claim(a.token,'p',1001);
  const answers=Array(80).fill('ไม่ได้ตอบ');answers[0]='ค';
  await store.save(a.token,'p',answers,2,1002);
  await store.save(a.token,'p',Array(80).fill('ไม่ได้ตอบ'),1,1003);
  assert.equal((await store.inspect(a.token)).userAnswers[0],'ค');
});
for(const reason of ['completed','exited'])test(`${reason} permanently locks and repeated finish cannot change answers`,async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);await store.claim(a.token,'p',1001);
  const answers=Array(80).fill('ก');
  await store.finish(a.token,'p',reason,answers,1,1002);
  await store.finish(a.token,'p',reason,Array(80).fill('ข'),2,1003);
  assert.equal((await store.inspect(a.token)).status,reason);
  assert.deepEqual((await store.inspect(a.token)).userAnswers,answers);
  await assert.rejects(async()=>store.claim(a.token,'p',1004),/ended/);
  await assert.rejects(async()=>store.start(user,1005),/already/);
});
test('deadline comes from server and late answers cannot increase the score',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);await store.claim(a.token,'p',1001);
  assert.equal(a.deadline,3601000);
  await store.save(a.token,'p',Array(80).fill('ก'),1,1002);
  await store.finish(a.token,'p','completed',Array(80).fill('ข'),2,a.deadline);
  assert.equal((await store.inspect(a.token)).status,'timeout');
  assert.deepEqual((await store.inspect(a.token)).userAnswers,Array(80).fill('ก'));
});
test('expired attempts are finalized without client submission',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);
  await store.expire(a.deadline);
  assert.equal((await store.inspect(a.token)).status,'timeout');
  assert.equal((await store.pending()).length,1);
});
test('unknown tokens and wrong page ownership cannot save answers',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);await store.claim(a.token,'p',1001);
  await assert.rejects(async()=>store.save('invalid','p',Array(80).fill('ก'),1,1002));
  await assert.rejects(async()=>store.save(a.token,'other',Array(80).fill('ก'),1,1002));
});
test('failed sheet delivery leaves a pending result and never restores eligibility',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);await store.claim(a.token,'p',1001);
  await store.finish(a.token,'p','exited',Array(80).fill('ไม่ได้ตอบ'),0,1002);
  assert.equal((await store.pending()).length,1);
  await assert.rejects(async()=>store.start(user,1003),/already/);
  await store.markSynced(a.id);
  assert.equal((await store.pending()).length,0);
});

test('lock remains after the original connection is closed and server storage reopens',async t=>{
  assert.ok(mod);
  const dir=mkdtempSync(join(tmpdir(),'exam-restart-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'attempts.sqlite');
  const first=new mod.AttemptsStore(path);await first.start(user,1000);first.close();
  const restarted=new mod.AttemptsStore(path);
  try{await assert.rejects(async()=>restarted.start(user,1001),/already/);}finally{restarted.close();}
});
test('lost connection ends the attempt even when no unload event reaches the server',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);await store.claim(a.token,'p',1001);
  await store.expire(61001);
  assert.equal((await store.inspect(a.token)).status,'exited');
  await assert.rejects(async()=>store.start(user,61002),/already/);
});
test('answers cannot be saved after a finished exam',async t=>{
  const {store}=fixture(t);const a=await store.start(user,1000);await store.claim(a.token,'p',1001);
  await store.finish(a.token,'p','exited',Array(80).fill('ก'),1,1002);
  await assert.rejects(async()=>store.save(a.token,'p',Array(80).fill('ข'),2,1003));
  assert.deepEqual((await store.inspect(a.token)).userAnswers,Array(80).fill('ก'));
});
