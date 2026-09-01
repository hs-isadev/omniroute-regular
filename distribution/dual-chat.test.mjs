import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {regularConfig} from './settings.mjs';
import {getRuntimePaths} from '../packages/config/dist/index.js';
import {SecretVault,InMemoryKeyProtector} from '../packages/vault/dist/index.js';
import {ProviderHttpError} from '../packages/providers/dist/index.js';
const mod=await import('./dual-chat.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
const request={model:'regular',messages:[{role:'user',content:'hello'}],stream:true};
test('OpenCode selects OmniRoute for both main and small models, no upstream key',()=>{
  assert.equal(typeof mod.openCodeConfig,'function','dual host config missing');
  const config=mod.openCodeConfig('http://127.0.0.1:12345/v1','fixture-local-token');
  assert.equal(config.model,'omniroute/regular');assert.equal(config.small_model,'omniroute/regular');
  assert.deepEqual(config.enabled_providers,['omniroute']);assert.equal(config.share,'disabled');
  assert.equal(config.provider.omniroute.options.apiKey,'fixture-local-token');
  assert.equal(config.permission.bash,'ask');
});
test('classification uses the user request, not thousands of tool schema tokens',()=>{
  assert.equal(typeof mod.requestIntent,'function','intent isolation missing');
  assert.equal(mod.requestIntent({...request,tools:[{function:{description:'security coding deploy '.repeat(2000)}}]}).intent,'casual_question');
  assert.equal(mod.requestIntent({...request,messages:[{role:'user',content:'Write a Python function to add two numbers'}]}).modelPreference,'quality');
});
test('native tool calls and results survive the compatibility boundary',()=>{
  assert.equal(typeof mod.upstreamBody,'function','native conversation transport missing');
  const messages=[...request.messages,{role:'assistant',content:null,tool_calls:[{id:'call1',type:'function',function:{name:'read',arguments:'{"path":"x"}'}}]},{role:'tool',tool_call_id:'call1',content:'contents'}];
  const body=mod.upstreamBody({...request,messages,tools:[{type:'function',function:{name:'read',parameters:{type:'object'}}}]},{providerId:'groq',modelId:'openai/gpt-oss-120b',maxOutputTokens:512});
  assert.deepEqual(body.messages,messages);assert.equal(body.tools[0].function.name,'read');assert.equal(body.model,'openai/gpt-oss-120b');assert.equal(body.stream,false);
  assert.equal(body.provider,undefined);
});
test('rejects alternate model, non-text input, unsafe extra options and excessive budgets',()=>{
  assert.equal(typeof mod.validateChat,'function','validation missing');
  for(const input of [{...request,model:'paid'},{...request,messages:[]},{...request,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'http://private'}}]}]},{...request,models:['paid']},{...request,max_tokens:1e9}])assert.throws(()=>mod.validateChat(input));
  const body=mod.upstreamBody({...request,baseURL:'https://evil.invalid',provider:{order:['paid']},api_key:'not-forwarded'},{providerId:'openrouter',modelId:'openrouter/free',maxOutputTokens:512});
  assert.equal(body.baseURL,undefined);assert.equal(body.api_key,undefined);assert.deepEqual(body.provider,{max_price:{prompt:0,completion:0},allow_fallbacks:true});
});
test('session proxy requires token, rejects browser requests and preserves tool-call SSE',async()=>{
  assert.equal(typeof mod.startChatProxy,'function','local proxy missing');
  const calls=[];
  const proxy=await mod.startChatProxy({complete:async input=>{calls.push(input);return {id:'chatcmpl_test',object:'chat.completion',created:1,model:'fixture/model',choices:[{index:0,message:{role:'assistant',content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'read',arguments:'{}'}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}};}});
  try {
    assert.equal((await fetch(proxy.baseURL+'/chat/completions',{method:'POST',body:JSON.stringify(request)})).status,401);
    const headers={authorization:'Bearer '+proxy.token,'content-type':'application/json'};
    assert.equal((await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{...headers,origin:'http://evil.invalid'},body:JSON.stringify(request)})).status,403);
    const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers,body:JSON.stringify(request)});
    assert.equal(response.status,200);const text=await response.text();assert.match(text,/tool_calls/);assert.match(text,/call_1/);assert.match(text,/\[DONE\]/);assert.equal(calls.length,1);
  }finally{await proxy.close();}
});
test('malformed upstream answers never become apparently successful completions',()=>{
  assert.equal(typeof mod.normalizeCompletion,'function','completion validation missing');
  for(const body of [{},{choices:[]},{choices:[{message:{content:null},finish_reason:'stop'}]}])assert.throws(()=>mod.normalizeCompletion(body,{providerId:'test',modelId:'test'},'route'));
  const body=mod.normalizeCompletion({choices:[{message:{role:'assistant',content:'OK'},finish_reason:'stop'}]},{providerId:'groq',modelId:'actual'},'route');
  assert.match(body.choices[0].message.content,/groq\/actual/);
});
test('tool capability upgrades are restricted to explicitly tested model IDs',()=>{
  assert.equal(typeof mod.applyVerifiedToolCapabilities,'function','verified tool metadata missing');
  const config={providers:[{id:'mistral',models:[{modelId:'mistral-small-2603',capabilities:{text:true}},{modelId:'unknown-paid',capabilities:{text:true}}]}]};
  mod.applyVerifiedToolCapabilities(config);
  assert.equal(config.providers[0].models[0].capabilities.tool_calling,true);
  assert.equal(config.providers[0].models[1].capabilities.tool_calling,undefined);
});
test('live-verified Kilo and Zen tool models are eligible, untested variants remain unchanged',()=>{
  const config=regularConfig();mod.applyVerifiedToolCapabilities(config);
  for(const [provider,id] of [['kilo','openrouter/free'],['opencode-zen','big-pickle']])assert.equal(config.providers.find(p=>p.id===provider).models.find(m=>m.modelId===id).capabilities.tool_calling,true);
  assert.equal(config.providers.find(p=>p.id==='kilo').models.find(m=>m.modelId==='kilo-auto/free').capabilities.tool_calling,undefined);
});
async function routedFixture(failureCount=0){
  const root=await mkdtemp(join(tmpdir(),'dual-routing-')),protector=new InMemoryKeyProtector();
  const config=regularConfig();const vault=await SecretVault.create(protector);
  for(const id of ['groq','openrouter']){const p=config.providers.find(p=>p.id===id);p.enabled=true;vault.set(id,{[p.credentialField]:'fixture-'+id});}
  await vault.save(getRuntimePaths(root).vault);vault.dispose();
  const models=config.providers.filter(p=>p.enabled).flatMap(p=>p.models.filter(m=>m.enabled&&m.allowed).map(m=>({providerId:p.id,modelId:m.modelId,enabled:true,allowed:true,health:{status:'healthy'},contextWindow:131072,maxOutputTokens:8192,reasoningEfforts:['none'],intelligenceTier:m.intelligenceTier,latencyTier:m.latencyTier,pricing:{inputPerMillionUsd:0,outputPerMillionUsd:0},capabilities:{text:true,coding:true,toolCalling:true}})));
  const calls=[];
  const backend=await mod.createChatBackend(root,{protector,configOverride:config,registryOverride:{models},loggerOverride:{write:async()=>{}},transportFactory:p=>({request:async(_id,_path,options)=>{const body=JSON.parse(options.body);calls.push({provider:p.id,model:body.model});if(calls.length<=failureCount)throw new ProviderHttpError(p.id,429,1000,'fixture rate limit');return Response.json({choices:[{message:{role:'assistant',content:'OK'},finish_reason:'stop'}]});}})});
  return {backend,calls};
}
test('casual requests select light models and coding requests select the 120B quality model',async()=>{
  const casual=await routedFixture();await casual.backend.complete(request);assert.notEqual(casual.calls[0].model,'openai/gpt-oss-120b');
  const code=await routedFixture();await code.backend.complete({...request,messages:[{role:'user',content:'Write a Python function to add two numbers'}]});assert.equal(code.calls[0].model,'openai/gpt-oss-120b');
});
test('a limited model falls back inside the same provider before another provider',async()=>{
  const f=await routedFixture(1);await f.backend.complete({...request,messages:[{role:'user',content:'Write a Python function to add two numbers'}]});
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].provider,'groq');assert.equal(f.calls[1].provider,'groq');assert.notEqual(f.calls[0].model,f.calls[1].model);
});
