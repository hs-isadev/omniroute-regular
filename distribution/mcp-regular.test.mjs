import assert from 'node:assert/strict';
import test from 'node:test';
import { regularConfig } from './settings.mjs';
import { createRegularBackend } from './mcp-regular.mjs';
import { configure } from './settings.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRuntimePaths } from '../packages/config/dist/index.js';
import { InMemoryKeyProtector } from '../packages/vault/dist/index.js';

test('regular MCP locks mode, bounds concurrency and preserves host authority',async()=>{
  const config=regularConfig();let received;let complete;
  const backend=await createRegularBackend({config,router:{route:async request=>{received=request;return new Promise(resolve=>complete=resolve);}},registry:async()=>({models:[]}),recent:async()=>[]});
  const input={prompt:'hello',requiredCapabilities:[],hostApplication:'antigravity',hostModel:'claimed',hostModelAuthoritative:false};
  await assert.rejects(backend.route({...input,routingMode:'orchestrator'}),/regular/i);
  const first=backend.route(input);
  await assert.rejects(backend.route(input),/busy/i);
  assert.equal(received.routingMode,'regular');assert.equal(received.hostModel,null);assert.equal(received.sourceClient,'antigravity-mcp');
  complete({answer:'ok'});await first;
});

test('regular MCP rejects non-free or orchestrator configuration before provider access',async()=>{
  const config=regularConfig();config.routing.freeOnly=false;
  await assert.rejects(createRegularBackend({config}),/free-only/i);
  config.routing.freeOnly=true;config.routing.defaultMode='orchestrator';
  await assert.rejects(createRegularBackend({config}),/regular/i);
});

test('regular MCP honors caller cancellation and filters model diagnostics',async()=>{
  const config=regularConfig();const controller=new AbortController();controller.abort(new Error('cancelled'));
  let calls=0;
  const backend=await createRegularBackend({config,router:{route:async()=>{calls++;}},registry:async()=>({models:[{enabled:false,allowed:false},{enabled:true,allowed:true,providerId:'groq'}]}),recent:async()=>[]});
  await assert.rejects(backend.route({prompt:'hello',requiredCapabilities:[]},controller.signal),/cancelled/);
  assert.equal(calls,0);assert.equal((await backend.models()).length,1);
});
test('complete regular runtime uses encrypted fixture vault, cached discovery, real routing and content-free logs',async()=>{
  const paths=getRuntimePaths(await mkdtemp(join(tmpdir(),'omni-runtime-fixture-'))),protector=new InMemoryKeyProtector(Buffer.alloc(32,19));
  await configure({keys:{GROQ_API_KEY:'fixture-runtime-key'},freeOnlyConfirmed:true},paths,{protector,factory:()=>({generate:async()=>({text:'OK'})})});
  const config=JSON.parse(await readFile(paths.config,'utf8'));let catalogCalls=0,failResponse=false;
  const backend=await createRegularBackend({config,paths,protector,providerOptions:{skipDnsValidationForTests:true,fetchImpl:async(url)=>{
    assert.equal(new URL(url).hostname,'api.groq.com');
    if(String(url).endsWith('/models')) {catalogCalls++;return Response.json({data:config.providers.find(p=>p.id==='groq').models.map(m=>({id:m.modelId}))});}
    if(failResponse)return Response.json({error:{message:'fixture-private-content-must-not-log'}},{status:400});
    return new Response('data: '+JSON.stringify({id:'fixture-stream',choices:[{delta:{content:'fixture answer'}}],usage:{prompt_tokens:10,completion_tokens:2}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  }}});
  const result=await backend.route({prompt:'What is a variable?',requiredCapabilities:[]});
  assert.equal(result.attribution.worker.modelId,'openai/gpt-oss-20b');assert.match(result.badge,/groq/);
  const before=catalogCalls;await backend.models();assert.equal(catalogCalls,before);
  assert.equal((await backend.recentRoutes(1)).length,1);
  const usage=await backend.usageSummary();
  assert.equal(usage.routes,1);
  assert.equal(usage.providerReportedTokensOffloaded,12);
  assert.equal(usage.actualHostTokensSaved,null);
  assert.doesNotMatch(await readFile(paths.log,'utf8'),/What is a variable|fixture-runtime-key/);
  failResponse=true;await assert.rejects(backend.route({prompt:'fixture-private-content-must-not-log',requiredCapabilities:[]}),/400/);
  assert.doesNotMatch(await readFile(paths.log,'utf8'),/fixture-private-content-must-not-log/);
  await assert.rejects(backend.route({prompt:' ',requiredCapabilities:[]}),/Invalid/);
  await assert.rejects(createRegularBackend({paths:getRuntimePaths(join(paths.root,'missing'))}),/ENOENT/);
});
