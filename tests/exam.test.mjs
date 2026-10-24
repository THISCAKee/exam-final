import assert from 'node:assert/strict';
import test from 'node:test';
import { allQuestions } from '../src/app/lib/questions.ts';

// Catch missing questions, duplicate IDs, and broken option extraction.
test('exam contains all 80 distinct questions with four options', () => {
  assert.equal(allQuestions.length, 80);
  assert.deepEqual(allQuestions.map(q => q.id), Array.from({length:80}, (_,i)=>i+1));
  assert.ok(allQuestions.every(q => q.options.length === 4 && q.options.every(Boolean)));
});

// Copied independently from the PDF quick key, not the production answer key.
const key = ['คกคขงกขคขคขกกงงงคขกง','กขกขคคขงกคคงคกขขงงงก','ขกกคขขกขงงคขงงคงกคกค','กงงกคกขขคคคขกงขงกคขง'].join('').split('');
const payload = () => ({ firstName:' ทดสอบ ', lastName:'ระบบ', studentId:'001234', section:'01', questionOrder:Array.from({length:80},(_,i)=>i+1), userAnswers:[...key] });
const grading = await import('../src/server/grading.ts').catch(() => null);

test('all PDF answers earn 80 points and preserve student identifiers', () => {
  assert.ok(grading, 'server grading is required');
  const result = grading.gradeSubmission(payload());
  assert.equal(result.score,80);
  assert.equal(result.studentId,'001234');
  assert.equal(result.firstName,'ทดสอบ');
});
test('shuffled questions are scored and written in original question order', () => {
  assert.ok(grading);
  const p=payload(); p.questionOrder.reverse(); p.userAnswers.reverse();
  const result=grading.gradeSubmission(p);
  assert.equal(result.score,80);
  assert.deepEqual(result.answers,key);
  const row=grading.buildResultRow(result,'2026-10-24T00:00:00.000Z');
  assert.equal(row.length,86);
  assert.deepEqual(row.slice(0,7),['2026-10-24T00:00:00.000Z','ทดสอบ','ระบบ','001234','01',80,'ค']);
  assert.equal(row[85],'ง');
});
test('unanswered and wrong choices receive no points', () => {
  assert.ok(grading);
  const p=payload(); p.userAnswers.fill('ไม่ได้ตอบ');
  assert.equal(grading.gradeSubmission(p).score,0);
  p.userAnswers[0]='ก'; p.userAnswers[1]='ก';
  assert.equal(grading.gradeSubmission(p).score,1);
});
for (const [name, mutate] of [
  ['duplicate question IDs',p=>p.questionOrder[1]=1],
  ['unknown question IDs',p=>p.questionOrder[79]=81],
  ['partial question list',p=>{p.questionOrder.pop();p.userAnswers.pop();}],
  ['invalid choice',p=>p.userAnswers[0]='จ'],
  ['missing last name',p=>p.lastName=' '],
  ['missing section',p=>p.section=''],
  ['non-array answers',p=>p.userAnswers='ก'.repeat(80)],
]) test(`rejects ${name}`,()=>{
  assert.ok(grading);
  const p=payload(); mutate(p);
  assert.throws(()=>grading.gradeSubmission(p));
});
