import assert from 'node:assert/strict';
import test from 'node:test';
import { examRequest } from '../src/app/lib/exam-session.ts';

test('HTTP 500 is a failed submission even when fetch resolves', async()=>{
  await assert.rejects(()=>examRequest('submit', {}, async()=>new Response(JSON.stringify({error:'failed'}),{status:500})));
});
test('HTTP 200 without success confirmation is not accepted',async()=>{
  await assert.rejects(()=>examRequest('submit', {},async()=>Response.json({})));
});
test('only a confirmed saved submission succeeds',async()=>{
  await examRequest('submit', {},async()=>Response.json({success:true}));
});
