import assert from 'node:assert/strict';
import test from 'node:test';
import { regularConfig, configure } from './settings.mjs';
import { createRegularBackend } from './mcp-regular.mjs';
import { DEFAULT_CONFIG } from '../packages/config/dist/index.js';
import { resolve, dirname } from 'node:path';
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

function consumerConfig(id) {
  const config=regularConfig(), provider=config.providers.find(p=>p.id===id);
  const generic=!['claude-consumer','zai-consumer'].includes(id);
  const adapter=resolve(import.meta.dirname,'../packages',generic?'browser-consumer-adapter':id+'-adapter','src/adapter.mjs');
  Object.assign(provider,{enabled:true,freeTierConfirmed:true,mcpCommand:process.execPath,mcpArgs:[adapter,...(generic?['--provider',id.replace('-consumer','')]:[]),'--endpoint',provider.baseUrl],mcpWorkingDirectory:dirname(adapter)});
  return {config,provider};
}

for(const id of DEFAULT_CONFIG.providers.filter(p=>p.id.endsWith('-consumer')).map(p=>p.id)) test(`${id} can register MCP tools under the trusted bounded browser policy`,async()=>{
  const {config}=consumerConfig(id);
  const backend=await createRegularBackend({config,...injected});
  assert.equal(typeof backend.route,'function');
});

for(const [name,edit] of [
  ['remote endpoint',p=>p.baseUrl='http://remote.invalid:9222'],
  ['arbitrary executable',p=>p.mcpCommand='untrusted-command'],
  ['arbitrary adapter',p=>p.mcpArgs[0]=resolve('untrusted-adapter.mjs')],
  ['extra arguments',p=>p.mcpArgs.push('--unsafe')],
  ['task expansion',p=>p.maxTaskClass='critical'],
  ['context expansion',p=>p.models[0].contextWindow=1_000_000],
  ['capability expansion',p=>p.models[0].capabilities.tool_calling=true],
]) test(`browser registration rejects ${name}`,async()=>{
  const {config,provider}=consumerConfig('qwen-consumer');edit(provider);
  await assert.rejects(createRegularBackend({config,...injected}),/trusted local adapter policy/);
});
