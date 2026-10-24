import assert from 'node:assert/strict';
import test from 'node:test';
const writer = await import('../src/server/sheets.ts').catch(()=>null);

function fakeSheets({title="exam-final-69", headers=['Timestamp','FirstName','LastName','StudentID','Section','Score',...Array.from({length:60},(_,i)=>`Q${i+1}`)], fail=false, gid=1872488623}={}) {
  const calls=[];
  const client={spreadsheets:{
    get:async()=>({data:{sheets:[{properties:{sheetId:gid,title,gridProperties:{columnCount:66}}}]}}),
    batchUpdate:async p=>{calls.push(['resize',p]);return {data:{}};},
    values:{
      get:async()=>({data:{values:[headers]}}),
      update:async p=>{calls.push(['header',p]);return {data:{}};},
      append:async p=>{if(fail)throw Error('Google unavailable');calls.push(['append',p]);return {data:{updates:{updatedRows:1}}};},
  }}};
  return {client,calls};
}
const config={spreadsheetId:'target-spreadsheet',worksheetId:1872488623};

test('writes to selected gid, extends 60 headers, and stores score as a number',async()=>{
  assert.ok(writer,'Sheets writer is required');
  const {client,calls}=fakeSheets();
  await writer.appendResult(client,config,['timestamp','name','last','00123','01',80,...Array(80).fill('ก')]);
  const resize=calls.find(c=>c[0]==='resize')[1];
  assert.equal(resize.requestBody.requests[0].updateSheetProperties.properties.gridProperties.columnCount,86);
  const header=calls.find(c=>c[0]==='header')[1];
  assert.equal(header.requestBody.values[0][85],'Q80');
  const append=calls.find(c=>c[0]==='append')[1];
  assert.equal(append.spreadsheetId,'target-spreadsheet');
  assert.equal(append.range,"'exam-final-69'!A:CH");
  assert.equal(append.valueInputOption,'RAW');
  assert.equal(append.requestBody.values[0][5],80);
  assert.equal(append.requestBody.values[0][3],'00123');
});
test('does not write to another tab when gid is missing',async()=>{
  assert.ok(writer);
  const {client,calls}=fakeSheets({gid:0});
  await assert.rejects(()=>writer.appendResult(client,config,[]));
  assert.equal(calls.length,0);
});
test('refuses incompatible headers before changing the sheet',async()=>{
  assert.ok(writer);
  const {client,calls}=fakeSheets({headers:['OtherData']});
  await assert.rejects(()=>writer.appendResult(client,config,[]));
  assert.equal(calls.length,0);
});
test('Google append failure propagates to the caller',async()=>{
  assert.ok(writer);
  const {client}=fakeSheets({fail:true});
  await assert.rejects(()=>writer.appendResult(client,config,[]),/Google unavailable/);
});

test('retries update the existing AttemptID row instead of appending duplicate grades',async()=>{
  assert.ok(writer);
  const {client,calls}=fakeSheets();
  client.spreadsheets.values.get=async ({range})=>({data:{values:range.endsWith('CI2:CI') ? [['attempt-123']] : [['Timestamp','FirstName','LastName','StudentID','Section','Score',...Array.from({length:80},(_,i)=>`Q${i+1}`),'AttemptID']]}});
  await writer.appendResult(client,config,Array(86).fill('value'),'attempt-123');
  assert.equal(calls.filter(c=>c[0]==='append').length,0);
  const updated=calls.find(c=>c[0]==='header')[1];
  assert.equal(updated.range,"'exam-final-69'!A2:CI2");
  assert.equal(updated.requestBody.values[0][86],'attempt-123');
});
