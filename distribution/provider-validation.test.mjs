import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyValidationFailure,validateConfiguredApiProviders} from '../scripts/validate-configured-providers.mjs';

test('provider validation reason codes distinguish safe failure classes',()=>{
  const adapter={classifyError:error=>error};
  assert.equal(classifyValidationFailure(adapter,{category:'authentication',providerStatus:401}).reasonCode,'INVALID_AUTHENTICATION');
  assert.equal(classifyValidationFailure(adapter,{category:'rate_limit',providerStatus:429}).reasonCode,'QUOTA_OR_RATE_LIMIT');
  assert.equal(classifyValidationFailure(adapter,{category:'unavailable',providerStatus:404}).reasonCode,'UNSUPPORTED_MODEL');
  assert.equal(classifyValidationFailure(adapter,{category:'unavailable',providerStatus:null}).reasonCode,'NETWORK_OR_ENDPOINT_FAILURE');
  assert.equal(classifyValidationFailure(adapter,{category:'timeout',providerStatus:null}).reasonCode,'NETWORK_OR_ENDPOINT_TIMEOUT');
  assert.equal(classifyValidationFailure(adapter,{category:'transient',providerStatus:503}).reasonCode,'PROVIDER_ERROR');
  assert.equal(classifyValidationFailure(adapter,{category:'invalid_request',providerStatus:400}).reasonCode,'UNSUPPORTED_MODEL_OR_REQUEST');
});

test('provider validation reports disabled and unconfigured routes without creating adapters',async()=>{
  const provider=(id,enabled)=>({id,type:'openai-compatible',enabled,freeTierOnly:true,freeTierConfirmed:true,baseUrl:`https://${id}.example.com/`,freeModelOrder:['free'],models:[{modelId:'free',enabled:true,allowed:true,inputPerMillionUsd:0,outputPerMillionUsd:0}]});
  const config={routing:{freeOnly:true},daemon:{maxConcurrentRoutes:4},providers:[provider('disabled',false),provider('unconfigured',true)]};
  let factoryCalls=0;
  const rows=await validateConfiguredApiProviders({config,defaults:config,vault:{list:()=>[],get:()=>{throw new Error('secret access not expected')}},factory:()=>{factoryCalls++;throw new Error('adapter not expected')},creditProviders:[]});
  assert.equal(factoryCalls,0);
  assert.deepEqual(rows.map(row=>[row.providerId,row.status,row.reasonCode,row.credentialPresent]),[
    ['disabled','NOT_TESTED','DISABLED',false],
    ['unconfigured','NOT_TESTED','UNCONFIGURED',false],
  ]);
});

test('provider validation never reports a failed live probe as success',async()=>{
  const settings={id:'configured',type:'openai-compatible',enabled:true,freeTierOnly:true,freeTierConfirmed:true,baseUrl:'https://configured.example.com/',freeModelOrder:['free'],models:[{modelId:'free',enabled:true,allowed:true,inputPerMillionUsd:0,outputPerMillionUsd:0}]};
  const rows=await validateConfiguredApiProviders({
    config:{routing:{freeOnly:true},daemon:{maxConcurrentRoutes:4},providers:[settings]},defaults:{providers:[settings]},
    vault:{list:()=>[{providerId:'configured'}],get:()=>({API_KEY:'not-a-real-key'})},creditProviders:[],
    factory:()=>({generate:async()=>{throw {category:'authentication',providerStatus:401}},classifyError:error=>error}),
  });
  assert.equal(rows[0].status,'FAILED');assert.equal(rows[0].reasonCode,'INVALID_AUTHENTICATION');
  assert.equal(rows[0].tests[0].status,'FAILED');
  assert.equal('message' in rows[0].tests[0],false);
});

test('provider validation records catalog exclusions without probing an unsupported model',async()=>{
  const settings={id:'configured',type:'openai-compatible',enabled:true,freeTierOnly:true,freeTierConfirmed:true,baseUrl:'https://configured.example.com/',apiPrefix:'v1/',freeModelOrder:['removed-free'],models:[{modelId:'removed-free',enabled:true,allowed:true,inputPerMillionUsd:0,outputPerMillionUsd:0}]};
  let generateCalls=0;
  const rows=await validateConfiguredApiProviders({
    config:{routing:{freeOnly:true},daemon:{maxConcurrentRoutes:4},providers:[settings]},defaults:{providers:[settings]},
    vault:{list:()=>[{providerId:'configured'}],get:()=>({API_KEY:'not-a-real-key'})},creditProviders:[],
    factory:()=>({listModels:async()=>[{id:'other-free'}],generate:async()=>{generateCalls++;return {text:'fake'}},classifyError:error=>error}),
  });
  assert.equal(generateCalls,0);assert.equal(rows[0].status,'FAILED');assert.equal(rows[0].reasonCode,'UNSUPPORTED_MODEL');
  assert.equal(rows[0].tests[0].status,'NOT_TESTED');
});

test('provider validation reports every configured credential slot independently',async()=>{
  const settings={id:'configured',type:'openai-compatible',enabled:true,freeTierOnly:true,freeTierConfirmed:true,baseUrl:'https://configured.example.com/',freeModelOrder:['free'],models:[{modelId:'free',enabled:true,allowed:true,inputPerMillionUsd:0,outputPerMillionUsd:0}]};
  const credentials=new Map([[1,{API_KEY:'fixture-good'}],[2,{API_KEY:'fixture-bad'}]]);
  const rows=await validateConfiguredApiProviders({
    config:{routing:{freeOnly:true},daemon:{maxConcurrentRoutes:4},providers:[settings]},defaults:{providers:[settings]},creditProviders:[],
    vault:{list:()=>[],listCredentialSlots:()=>[1,2].map(slot=>({providerId:'configured',slot})),getCredentialSlot:(_id,slot)=>credentials.get(slot)},
    factory:(_trusted,values)=>({listModels:async()=>[{id:'free'}],generate:async()=>{if(values.API_KEY.includes('bad'))throw {category:'authentication',providerStatus:401};return {text:'OK'};},classifyError:error=>error}),
  });
  assert.equal(rows[0].credentialCount,2);assert.deepEqual(rows[0].credentialSlots,[1,2]);
  assert.equal(rows[0].status,'PARTIAL_SUCCESS');assert.equal(rows[0].reasonCode,'SOME_CREDENTIAL_SLOTS_FAILED');
  assert.deepEqual(rows[0].slotResults.map(item=>[item.slot,item.status,item.reasonCode]),[[1,'SUCCESS','SUCCESS'],[2,'FAILED','INVALID_AUTHENTICATION']]);
});
