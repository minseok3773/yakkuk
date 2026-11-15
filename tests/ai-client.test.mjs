import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../ai-client.js', import.meta.url), 'utf8');
async function setup(mode = 'normal') {
  const calls = [], fields = Object.fromEntries(['connectionStatus','fictional','localRun','aiCheck'].map(id => [id, { checked:false, addEventListener() {} }]));
  const context = vm.createContext({ window: { YAKKUK_AI: {endpoint:'https://worker.example/'} },
    $: id => fields[id], runBtn:{disabled:true}, sample:null, URL, AbortController, setTimeout, clearTimeout, Date,
    setStatus(message) { context.message=message; },
    fetch: async (url, options) => {
      calls.push({url:String(url),options});
      if(String(url).endsWith('/api/status')) return { ok:mode!=='unavailable', json:async()=>({configured:true,fictionalOnly:true,allowed:true,remaining:20}) };
      return mode==='quota' ? {ok:false,json:async()=>({error:{code:'daily_quota',message:'오늘 AI 요청 한도',resetAt:new Date(Date.now()+86400000).toISOString()}})} :
        {ok:true,json:async()=>({text:'{"drugs":[]}'})};
    }
  });
  vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {context,fields,calls};
}
test('restores the Worker and checks consent for every inference without background inference',async()=>{
  const {context,fields,calls}=await setup();
  assert.equal(context.runBtn.textContent,'AI 자동 분석');
  assert.equal(calls.length,1);
  await assert.rejects(context.sample('가상 입력',{task:'analysis'}),e=>e.code==='not_granted');
  assert.equal(calls.length,1);
  fields.fictional.checked=true;
  await context.sample('가상 입력',{task:'analysis'});
  assert.equal(JSON.parse(calls[1].options.body).kind,'analysis');
  assert.equal(JSON.parse(calls[1].options.body).fictional,true);
  fields.fictional.checked=false;
  await assert.rejects(context.sample('설명'),e=>e.code==='not_granted');
  assert.equal(calls.length,2);
});
test('unsupported images and daily quota do not trigger extra model requests',async()=>{
  const {context,fields,calls}=await setup('quota');fields.fictional.checked=true;
  await assert.rejects(context.sample('가상',{images:['file']}),e=>e.code==='unsupported');
  assert.equal(calls.length,1);
  await assert.rejects(context.sample('가상',{task:'quiz'}),e=>e.code==='daily_quota');
  await assert.rejects(context.sample('가상',{task:'quiz'}),e=>e.code==='daily_quota');
  assert.equal(calls.length,2);
});
test('a failed connection retains the enabled local workflow',async()=>{
  const {context,fields}=await setup('unavailable');
  assert.equal(context.sample,null);assert.equal(context.runBtn.disabled,false);
  assert.equal(context.runBtn.textContent,'내장 자료로 정리하기');
  assert.match(fields.connectionStatus.textContent,/내장 자료/);
});
