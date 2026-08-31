import assert from 'node:assert/strict';
import test from 'node:test';
import { regularConfig } from './settings.mjs';
import { createRegularBackend } from './mcp-regular.mjs';

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
