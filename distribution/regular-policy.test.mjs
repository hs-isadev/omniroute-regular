import assert from 'node:assert/strict';
import test from 'node:test';
import { regularConfig, configure } from './settings.mjs';
import { createRegularBackend } from './mcp-regular.mjs';
const injected={router:{route:async()=>({})},registry:async()=>({models:[]}),recent:async()=>[]};
test('runtime rejects edited credential endpoints and models relabelled as free',async()=>{
  for(const edit of [p=>p.baseUrl='https://untrusted.invalid/',p=>p.apiPrefix='other/',p=>p.models.push({...p.models[0],modelId:'paid-model-relabeled',enabled:true,allowed:true})]) {
    const config=regularConfig();const p=config.providers.find(p=>p.id==='groq');p.enabled=true;edit(p);
    await assert.rejects(createRegularBackend({config,...injected}),/trusted|allowlist/i);
  }
});
test('credit-only providers cannot activate in regular setup and are disabled at runtime',async()=>{
  for(const name of ['HF_TOKEN','VERCEL_AI_GATEWAY_API_KEY']) await assert.rejects(configure({keys:{[name]:'fixture-credit'},freeOnlyConfirmed:true},{},{factory:()=>{throw Error('must not reach provider');}}),/credit/i);
  const config=regularConfig();config.providers.find(p=>p.id==='huggingface').enabled=true;
  await createRegularBackend({config,...injected});assert.equal(config.providers.find(p=>p.id==='huggingface').enabled,false);
});
test('unknown credential field never echoes its value or field name',async()=>{
  await assert.rejects(configure({keys:{'fixture-secret-as-field':'fixture-secret-value'},freeOnlyConfirmed:true},{}),e=>/field/i.test(e.message)&&!e.message.includes('fixture-secret'));
});
