import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const module = await import('./guided-setup.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
async function fixture(platform='win32', answers=['','yes']) {
  const root=await mkdtemp(join(tmpdir(),'omni-guided-'));
  await writeFile(join(root,'active-version.txt'),'versions/0.2.1-test\n');
  const calls=[],messages=[];
  const options={root,platform,node:'fixture-node',interactive:true,
    ask:async()=>answers.shift()??'',tell:text=>messages.push(text),
    run:async(command,args)=>{calls.push({command,args});return 0;}};
  return {root,calls,messages,options};
}
test('guided setup saves keys, previews, confirms then launches with argument arrays',async()=>{
  assert.equal(typeof module.runGuidedSetup,'function','guided setup is not implemented');
  const f=await fixture();const result=await module.runGuidedSetup(f.options);
  assert.equal(result.status,'launched');assert.equal(f.calls.length,3);
  assert.equal(f.calls[0].command,'powershell.exe');assert.ok(f.calls[0].args.includes('-RequireReady'));
  assert.ok(f.calls[1].args.includes('--dry-run'));assert.ok(!f.calls[1].args.includes('--apply'));
  assert.ok(f.calls[2].args.includes('--apply'));
  assert.equal(f.calls[2].args.at(-2),join(f.root,'workspace'));
  assert.ok(f.messages.some(text=>text.includes('omni_routes')));
});
test('cancelled or failed settings never prepares a workspace or launches',async()=>{
  assert.equal(typeof module.runGuidedSetup,'function');
  for(const code of [1,2]) {
    const f=await fixture();f.options.run=async()=>code;
    await assert.rejects(module.runGuidedSetup(f.options),/key setup/i);
    await assert.rejects(access(join(f.root,'workspace')),/ENOENT/);
  }
});
test('declining preview never applies integration',async()=>{
  assert.equal(typeof module.runGuidedSetup,'function');
  const f=await fixture('linux',['','no']);
  assert.equal((await module.runGuidedSetup(f.options)).status,'cancelled');
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].command,'sh');
});
test('preview and launch failures stop with stage-specific errors',async()=>{
  assert.equal(typeof module.runGuidedSetup,'function');
  for(const failed of [2,3]) {
    const f=await fixture();let calls=0;
    f.options.run=async()=>++calls===failed?1:0;
    await assert.rejects(module.runGuidedSetup(f.options),failed===2?/preview/i:/launch/i);
    assert.equal(calls,failed);
  }
});
test('custom workspace with spaces and shell metacharacters is passed literally',async()=>{
  assert.equal(typeof module.runGuidedSetup,'function');
  const f=await fixture('linux');const workspace=join(f.root,'My project & other');await mkdir(workspace);
  f.options.ask=async question=>question.includes('Project')?workspace:'yes';
  await module.runGuidedSetup(f.options);
  assert.ok(f.calls[2].args.includes(workspace));
});
test('unsafe state, noninteractive use and nonexistent projects fail closed',async()=>{
  assert.equal(typeof module.runGuidedSetup,'function');
  const f=await fixture();
  await assert.rejects(module.runGuidedSetup({...f.options,interactive:false}),/interactive/i);
  await writeFile(join(f.root,'active-version.txt'),'../escape');
  await assert.rejects(module.runGuidedSetup(f.options),/active version/i);
  assert.equal(f.calls.length,0);
  await writeFile(join(f.root,'active-version.txt'),'versions/0.2.1-test');
  f.options.ask=async()=>join(f.root,'missing');
  await assert.rejects(module.runGuidedSetup(f.options),/existing project/i);
  await assert.rejects(module.runGuidedSetup({...f.options,root:'relative'}),/absolute/i);
});
