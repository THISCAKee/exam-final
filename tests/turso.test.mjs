import assert from 'node:assert/strict';
import test from 'node:test';
const mod=await import('../src/server/turso.ts').catch(()=>null);
const ok=(result={},baton=null)=>Response.json({baton,base_url:null,results:[{type:'ok',response:{type:'execute',result:{cols:[],rows:[],affected_row_count:0,...result}}}]});

test('Turso binds user values separately and decodes typed row values',async()=>{
 assert.ok(mod,'Turso HTTP transport is required');let sent;
 const db=new mod.TursoDatabase('libsql://exam-test.turso.io','secret',async(url,options)=>{
  sent={url,options,body:JSON.parse(options.body)};
  return ok({cols:[{name:'studentId'},{name:'score'},{name:'pageId'}],rows:[[{type:'text',value:'00123'},{type:'integer',value:'80'},{type:'null'}]]},'b1');
 });
 const conn=await db.connect();
 const result=await conn.execute('SELECT studentId, score, pageId FROM attempts WHERE student_key=?',["a' OR 1=1"]);
 assert.equal(sent.url,'https://exam-test.turso.io/v2/pipeline');
 assert.equal(sent.options.headers.Authorization,'Bearer secret');
 assert.equal(sent.body.requests[0].stmt.sql,'SELECT studentId, score, pageId FROM attempts WHERE student_key=?');
 assert.deepEqual(sent.body.requests[0].stmt.args,[{type:'text',value:"a' OR 1=1"}]);
 assert.deepEqual(result.rows,[{studentId:'00123',score:80,pageId:null}]);
});
test('interactive transaction carries its baton through commit and closes',async()=>{
 assert.ok(mod);const calls=[];
 const db=new mod.TursoDatabase('libsql://exam-test.turso.io','secret',async(url,opts)=>{
  const b=JSON.parse(opts.body);calls.push(b);
  return ok({},b.requests.some(x=>x.type==='close')?null:'baton-123');
 });
 const c=await db.connect();await c.execute('BEGIN IMMEDIATE');await c.execute('UPDATE attempts SET synced=? WHERE id=?',[1,'id']);await c.execute('COMMIT');await c.close();
 assert.equal(calls[1].baton,'baton-123');assert.equal(calls[2].baton,'baton-123');assert.equal(calls[3].requests[0].type,'close');
});
test('SQL errors are failures even when HTTP succeeds',async()=>{
 assert.ok(mod);const db=new mod.TursoDatabase('libsql://exam-test.turso.io','secret',async()=>Response.json({baton:'b',results:[{type:'error',error:{code:'SQLITE_CONSTRAINT',message:'unique'}}]}));
 const c=await db.connect();await assert.rejects(()=>c.execute('INSERT'),/SQLITE_CONSTRAINT/);
});
test('authentication failures do not expose the token',async()=>{
 assert.ok(mod);const db=new mod.TursoDatabase('https://exam-test.turso.io','secret-value',async()=>new Response('secret-value',{status:401}));
 const c=await db.connect();await assert.rejects(()=>c.execute('SELECT 1'),e=>e.message.includes('401')&&!e.message.includes('secret-value'));
});
test('refuses clear-text database transport',()=>{
 assert.ok(mod);assert.throws(()=>new mod.TursoDatabase('http://exam-test.turso.io','secret'),/HTTPS/);
});
