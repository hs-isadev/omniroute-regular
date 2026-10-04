import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { configureDevinCli, devinMcpArguments } from './devin.mjs';

test('Devin registration is local, regular-mode only, and never selects Fusion or a paid model',async()=>{
  const root=join(tmpdir(),'Omni Route Test'),node=join(root,'versions/current/node',process.platform==='win32'?'node.exe':'node'),entrypoint=join(root,'versions/current/app/distribution/mcp-regular.mjs');
  const args=devinMcpArguments({root,node,entrypoint});
  assert.deepEqual(args,[
    'mcp','add','-s','user',
    '-e',`OMNIROUTE_HOME=${join(root,'data')}`,
    '-e','OMNIROUTE_ROUTING_MODE=regular',
    'omniroute_regular','--',node,entrypoint,
  ]);
  assert.doesNotMatch(args.join(' '),/fusion|astra|sol|terra|model|api[_-]?key/i);
});

test('Devin setup leaves a missing CLI untouched and preserves a nonzero registration result for user review',async()=>{
  const root=join(tmpdir(),'Omni Route Test'),common={root,node:join(root,'node',process.platform==='win32'?'node.exe':'node'),entrypoint:join(root,'mcp-regular.mjs')};
  let calls=0;
  assert.deepEqual(await configureDevinCli({...common,executable:null,run:async()=>{calls++;}}),{status:'not-installed'});
  assert.equal(calls,0);
  const executable=join(tmpdir(),'Program Files/Devin',process.platform==='win32'?'devin.exe':'devin');
  assert.deepEqual(await configureDevinCli({...common,executable,run:async()=>{calls++;}}),{status:'unverified'});
  assert.equal(calls,0);
  const result=await configureDevinCli({...common,executable,verified:true,run:async()=>{calls++;throw new Error('duplicate');}});
  assert.deepEqual(result,{status:'needs-user-review'});
  assert.equal(calls,1);
});
