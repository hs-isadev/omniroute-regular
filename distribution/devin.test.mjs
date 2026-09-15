import assert from 'node:assert/strict';
import test from 'node:test';
import { configureDevinCli, devinMcpArguments } from './devin.mjs';

test('Devin registration is local, regular-mode only, and never selects Fusion or a paid model',async()=>{
  const root='C:\\Omni Route Test',node='C:\\Omni Route Test\\versions\\current\\node\\node.exe',entrypoint='C:\\Omni Route Test\\versions\\current\\app\\distribution\\mcp-regular.mjs';
  const args=devinMcpArguments({root,node,entrypoint});
  assert.deepEqual(args,[
    'mcp','add','-s','user',
    '-e',`OMNIROUTE_HOME=${root}\\data`,
    '-e','OMNIROUTE_ROUTING_MODE=regular',
    'omniroute_regular','--',node,entrypoint,
  ]);
  assert.doesNotMatch(args.join(' '),/fusion|astra|sol|terra|model|api[_-]?key/i);
});

test('Devin setup leaves a missing CLI untouched and preserves a nonzero registration result for user review',async()=>{
  const common={root:'C:\\Omni Route Test',node:'C:\\Omni Route Test\\node.exe',entrypoint:'C:\\Omni Route Test\\mcp-regular.mjs'};
  let calls=0;
  assert.deepEqual(await configureDevinCli({...common,executable:null,run:async()=>{calls++;}}),{status:'not-installed'});
  assert.equal(calls,0);
  assert.deepEqual(await configureDevinCli({...common,executable:'C:\\Program Files\\Devin\\devin.exe',run:async()=>{calls++;}}),{status:'unverified'});
  assert.equal(calls,0);
  const result=await configureDevinCli({...common,executable:'C:\\Program Files\\Devin\\devin.exe',verified:true,run:async()=>{calls++;throw new Error('duplicate');}});
  assert.deepEqual(result,{status:'needs-user-review'});
  assert.equal(calls,1);
});
