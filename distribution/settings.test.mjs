import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure, regularConfig, fields } from './settings.mjs';
import { getRuntimePaths, loadConfig, saveConfig, EXTRA_FREE_PROVIDERS } from '../packages/config/dist/index.js';
import { InMemoryKeyProtector, SecretVault } from '../packages/vault/dist/index.js';

const fixture='fixture-only-not-a-real-secret-123';
async function context(){return {paths:getRuntimePaths(await mkdtemp(join(tmpdir(),'omni-regular-test-'))),protector:new InMemoryKeyProtector(Buffer.alloc(32,17))};}
const success=()=>({generate:async()=>({text:'OK'})});
test('regular policy is free-only, isolated and rejects external configuration',()=>{
  const config=regularConfig({providers:[{id:'openrouter',baseUrl:'https://evil.invalid'}]});
  assert.equal(config.routing.defaultMode,'regular'); assert.equal(config.routing.freeOnly,true);
  assert.equal(config.daemon.port,47839); assert.equal(config.budgets.monthlyUsd,0);
  assert.equal(config.providers.find(x=>x.id==='openrouter').baseUrl,'https://openrouter.ai/api/');
  assert.deepEqual(config.providers.find(x=>x.id==='openrouter').freeModelOrder,['openrouter/free']);
  assert.deepEqual(config.routing.directProviderOrder.slice(0,6),['claude-consumer','zai-consumer','qwen-consumer','kimi-consumer','deepseek-consumer','perplexity-consumer']);
  assert.ok(config.providers.every(x=>!x.enabled));
});
test('consent and required key validation fail closed',async()=>{
  const {paths,protector}=await context();
  await assert.rejects(configure({keys:{}},paths,{protector,factory:success}),/Confirm/);
  await assert.rejects(configure({keys:{},freeOnlyConfirmed:true},paths,{protector,factory:success}),/required/);
  await assert.rejects(configure({keys:{OPENROUTER_API_KEY:fixture},freeOnlyConfirmed:true},paths,{protector,factory:()=>({generate:async()=>{throw Error('bad key');}})}),/validation failed/);
  await assert.rejects(readFile(paths.vault),{code:'ENOENT'});
});
test('valid keys are encrypted; optional failures never activate',async()=>{
  const {paths,protector}=await context();
  const result=await configure({keys:{OPENROUTER_API_KEY:fixture,GROQ_API_KEY:'fixture-bad'},freeOnlyConfirmed:true},paths,{protector,factory:settings=>settings.id==='groq'?{generate:async()=>{throw Error('bad');}}:success()});
  assert.deepEqual(result.accepted,['openrouter']); assert.deepEqual(result.failed,['groq']);
  assert.ok(!(await readFile(paths.vault,'utf8')).includes(fixture));
  const vault=await SecretVault.load(paths.vault,protector);
  assert.equal(vault.get('openrouter').OPENROUTER_API_KEY,fixture); assert.equal(vault.get('groq'),null); vault.dispose();
  const config=JSON.parse(await readFile(paths.config,'utf8'));
  assert.deepEqual(config.providers.filter(x=>x.enabled).map(x=>x.id),['openrouter']);
  assert.deepEqual((await loadConfig(paths)).providers.find(x=>x.id==='openrouter').models.filter(x=>x.enabled&&x.allowed).map(x=>x.modelId),['openrouter/free']);
});
test('setup accepts any supported free provider credentials and counts Cloudflare once',async()=>{
  const {paths,protector}=await context();
  const five={GROQ_API_KEY:'fixture-groq',GEMINI_API_KEY:'fixture-gemini',MISTRAL_API_KEY:'fixture-mistral',COHERE_API_KEY:'fixture-cohere',CLOUDFLARE_API_TOKEN:'fixture-cloudflare',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)};
  const accepted=await configure({keys:{...five,CEREBRAS_API_KEY:'fixture-cerebras'},freeOnlyConfirmed:true},paths,{protector,factory:success});
  assert.equal(accepted.accepted.length,6);
  assert.deepEqual(accepted.accepted,['groq','gemini','mistral','cohere','cerebras','cloudflare']);
});
test('setup validates and reports five independent slots for one provider',async()=>{
  const {paths,protector}=await context();
  const slots={groq:Array.from({length:5},(_,index)=>({GROQ_API_KEY:`fixture-groq-${index+1}`}))};
  const result=await configure({slots,freeOnlyConfirmed:true},paths,{protector,factory:success});
  assert.deepEqual(result.accepted,['groq']);
  assert.deepEqual(result.slotResults.map(item=>[item.providerId,item.slot,item.status,item.reasonCode]),[
    ['groq',1,'ACCEPTED','SUCCESS'],['groq',2,'ACCEPTED','SUCCESS'],['groq',3,'ACCEPTED','SUCCESS'],['groq',4,'ACCEPTED','SUCCESS'],['groq',5,'ACCEPTED','SUCCESS'],
  ]);
  assert.deepEqual(result.stored,[{providerId:'groq',slots:[1,2,3,4,5]}]);
  const vault=await SecretVault.load(paths.vault,protector);
  assert.deepEqual(vault.getCredentialSlots('groq').map(item=>item.slot),[1,2,3,4,5]);vault.dispose();
});
test('a failed credential slot is identified and does not overwrite that saved slot',async()=>{
  const {paths,protector}=await context();
  await configure({slots:{groq:[{GROQ_API_KEY:'fixture-old-one'},{GROQ_API_KEY:'fixture-old-two'}]},freeOnlyConfirmed:true},paths,{protector,factory:success});
  const result=await configure({slots:{groq:[{}, {GROQ_API_KEY:'fixture-bad-two'}, {GROQ_API_KEY:'fixture-good-three'}]},freeOnlyConfirmed:true},paths,{protector,factory:(_settings,values)=>({generate:async()=>{if(values.GROQ_API_KEY.includes('bad'))throw {category:'authentication',providerStatus:401};return {text:'OK'};},classifyError:error=>error})});
  assert.deepEqual(result.slotResults.map(item=>[item.slot,item.status,item.reasonCode]),[[2,'FAILED','INVALID_AUTHENTICATION'],[3,'ACCEPTED','SUCCESS']]);
  const vault=await SecretVault.load(paths.vault,protector);const saved=vault.getCredentialSlots('groq');
  assert.equal(saved.find(item=>item.slot===2).values.GROQ_API_KEY,'fixture-old-two');
  assert.equal(saved.find(item=>item.slot===3).values.GROQ_API_KEY,'fixture-good-three');vault.dispose();
});
test('setup rejects more than five credential slots per provider',async()=>{
  const {paths,protector}=await context();
  await assert.rejects(configure({slots:{groq:Array.from({length:6},()=>({GROQ_API_KEY:'fixture'}))},freeOnlyConfirmed:true},paths,{protector,factory:success}),/five|5/i);
});
test('failed replacement preserves existing key and ignores edited endpoint',async()=>{
  const {paths,protector}=await context();
  await configure({keys:{OPENROUTER_API_KEY:fixture},freeOnlyConfirmed:true},paths,{protector,factory:success});
  await writeFile(paths.config,JSON.stringify({providers:[{id:'openrouter',baseUrl:'https://evil.invalid'}]}));
  let endpoint;
  const result=await configure({keys:{OPENROUTER_API_KEY:'fixture-replacement'},freeOnlyConfirmed:true},paths,{protector,factory:settings=>{endpoint=settings.baseUrl;return {generate:async()=>{throw Error('bad');}};}});
  assert.equal(endpoint,'https://openrouter.ai/api/'); assert.equal(result.ready,true);
  const vault=await SecretVault.load(paths.vault,protector); assert.equal(vault.get('openrouter').OPENROUTER_API_KEY,fixture); vault.dispose();
});
test('Windows DPAPI setup round trip without plaintext key files',{skip:process.platform!=='win32'},async()=>{
  const paths=getRuntimePaths(await mkdtemp(join(tmpdir(),'omni-regular-dpapi-')));
  await configure({keys:{OPENROUTER_API_KEY:fixture},freeOnlyConfirmed:true},paths,{factory:success});
  const vault=await SecretVault.load(paths.vault); assert.equal(vault.get('openrouter').OPENROUTER_API_KEY,fixture);vault.dispose();
  assert.ok(!(await readFile(paths.vault,'utf8')).includes(fixture));
  await assert.rejects(readFile(paths.credentialsImport),{code:'ENOENT'});
});
test('incomplete Cloudflare replacement keeps the existing provider enabled',async()=>{
  const {paths,protector}=await context();
  await configure({keys:{OPENROUTER_API_KEY:fixture,CLOUDFLARE_API_TOKEN:'fixture-cloudflare',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)},freeOnlyConfirmed:true},paths,{protector,factory:success});
  const result=await configure({keys:{CLOUDFLARE_API_TOKEN:'fixture-replacement'},freeOnlyConfirmed:true},paths,{protector,factory:success});
  assert.deepEqual(result.failed,['cloudflare']);
  assert.equal(JSON.parse(await readFile(paths.config,'utf8')).providers.find(x=>x.id==='cloudflare').enabled,true);
  const vault=await SecretVault.load(paths.vault,protector);assert.equal(vault.get('cloudflare').CLOUDFLARE_API_TOKEN,'fixture-cloudflare');vault.dispose();
});
test('all hosted free profiles have key-entry fields',()=>{
  assert.equal(Object.keys(fields).length,14);
  for(const profile of EXTRA_FREE_PROVIDERS) assert.ok(fields[profile.id].includes(profile.credentialField));
  assert.deepEqual(fields.cerebras,['CEREBRAS_API_KEY']);
  assert.deepEqual(fields.sambanova,['SAMBANOVA_API_KEY']);
});
test('existing setup preserves orchestrator mode, port, disabled providers and old keys',async()=>{
  const {paths,protector}=await context();
  await configure({keys:{OPENROUTER_API_KEY:fixture,GROQ_API_KEY:'fixture-groq'},freeOnlyConfirmed:true},paths,{protector,factory:success});
  const config=await loadConfig(paths);config.routing.defaultMode='orchestrator';config.daemon.port=47831;config.daemon.allowedOrigins=['http://127.0.0.1:47831'];
  config.providers.find(x=>x.id==='groq').enabled=false;await saveConfig(config,paths);
  const result=await configure({keys:{KILO_API_KEY:'fixture-kilo'},freeOnlyConfirmed:true},paths,{protector,factory:success,existingSetup:true});
  assert.deepEqual(result.accepted,['kilo']);const updated=await loadConfig(paths);
  assert.equal(updated.routing.defaultMode,'orchestrator');assert.equal(updated.daemon.port,47831);
  assert.equal(updated.providers.find(x=>x.id==='groq').enabled,false);assert.equal(updated.providers.find(x=>x.id==='kilo').enabled,true);
  assert.ok(updated.routing.directProviderOrder.includes('kilo'));
  const vault=await SecretVault.load(paths.vault,protector);assert.equal(vault.get('groq').GROQ_API_KEY,'fixture-groq');vault.dispose();
  await configure({keys:{GROQ_API_KEY:'fixture-invalid-replacement'},freeOnlyConfirmed:true},paths,{protector,existingSetup:true,factory:()=>({generate:async()=>{throw Error('invalid');}})});
  assert.equal((await loadConfig(paths)).providers.find(x=>x.id==='groq').enabled,false);
});
test('provider validation falls back within its free models before rejecting a key',async()=>{
  const {paths,protector}=await context();const attempts=[];
  const result=await configure({keys:{OPENROUTER_API_KEY:fixture,ZAI_API_KEY:'fixture-zai'},freeOnlyConfirmed:true},paths,{protector,factory:settings=>settings.id==='zai'?{generate:async request=>{attempts.push(request.modelId);if(attempts.length===1) throw Error('model unavailable');return {text:'OK'};}}:success()});
  assert.ok(result.accepted.includes('zai'));assert.deepEqual(attempts,['glm-4.7-flash','glm-4.5-flash']);
});

test('Antigravity setup accepts Groq alone without OpenRouter',async()=>{
  const {paths,protector}=await context();
  const result=await configure({keys:{GROQ_API_KEY:fixture},freeOnlyConfirmed:true},paths,{protector,factory:success});
  assert.equal(result.ready,true);assert.deepEqual(result.accepted,['groq']);
  assert.deepEqual((await loadConfig(paths)).providers.filter(p=>p.enabled).map(p=>p.id),['groq']);
});

test('validation never invokes a disabled, forbidden or unknown-price model',async()=>{
  const {paths,protector}=await context();const calls=[];
  const result=await configure({keys:{GROQ_API_KEY:fixture},freeOnlyConfirmed:true},paths,{protector,factory:settings=>({generate:async request=>{
    const model=settings.models.find(m=>m.modelId===request.modelId);calls.push(request.modelId);
    assert.ok(model.enabled&&model.allowed);assert.equal(model.inputPerMillionUsd,0);assert.equal(model.outputPerMillionUsd,0);
    return {text:'OK'};
  }})});
  assert.equal(result.ready,true);assert.ok(calls.length);
});
test('new coding candidates are opt-in and activated only after their own validation',async()=>{
  const {paths,protector}=await context();const calls=[];
  const base=regularConfig();
  assert.equal(base.providers.find(p=>p.id==='nvidia').models.find(m=>m.modelId==='moonshotai/kimi-k2.6')?.enabled,false);
  await configure({keys:{NVIDIA_API_KEY:fixture},freeOnlyConfirmed:true,validateCodingCandidates:true},paths,{protector,factory:()=>({generate:async r=>{calls.push(r.modelId);return {text:'OK'};}})});
  assert.ok(calls.includes('moonshotai/kimi-k2.6'));
  assert.equal((await loadConfig(paths)).providers.find(p=>p.id==='nvidia').models.find(m=>m.modelId==='moonshotai/kimi-k2.6').enabled,true);
  await configure({keys:{},freeOnlyConfirmed:true},paths,{protector,factory:success});
  assert.equal((await loadConfig(paths)).providers.find(p=>p.id==='nvidia').models.find(m=>m.modelId==='moonshotai/kimi-k2.6').enabled,true);
});
