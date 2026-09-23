import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const module = await import('./guided-setup.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
async function fixture(platform='win32', answers=['','yes']) {
  const root=await mkdtemp(join(tmpdir(),'omni-guided-'));
  const home=join(root,'home'); await mkdir(home,{recursive:true});
  await writeFile(join(root,'active-version.txt'),'versions/0.2.1-test\n');
  const calls=[],messages=[];
  const options={root,platform,node:'fixture-node',interactive:true,
    home,env:{PATH:''},
    ask:async()=>answers.shift()??'',tell:text=>messages.push(text),browserConsumers:false,
    run:async(command,args)=>{calls.push({command,args});return 0;}};
  return {root,calls,messages,options};
}
test('guided setup saves keys, previews, confirms then launches with argument arrays',async()=>{
  assert.equal(typeof module.runGuidedSetup,'function','guided setup is not implemented');
  const f=await fixture();const result=await module.runGuidedSetup(f.options);
  assert.equal(result.status,'launched');assert.equal(f.calls.length,3);
  assert.equal(f.calls[0].command,'fixture-node');assert.match(f.calls[0].args[0],/key-editor.mjs$/);
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
  assert.equal(f.calls.length,2);assert.match(f.calls[0].args[0],/key-editor.mjs$/);
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
  await assert.rejects(module.runGuidedSetup({...f.options,platform:'unsupported'}),/Windows or Linux/i);
  f.options.ask=async()=>'relative';
  await assert.rejects(module.runGuidedSetup(f.options),/absolute existing project/i);
});
test('real step runner returns exit status and handles spawn failure without shell interpolation',async()=>{
  assert.equal(await module.runStep(process.execPath,['-e','process.exit(0)']),0);
  assert.equal(await module.runStep(process.execPath,['-e','process.exit(7)']),7);
  await assert.rejects(module.runStep(join(tmpdir(),'omni-missing-executable'),[]),/Could not start a setup step/);
});
test('masked key entry remains an explicit alternative on both platforms',async()=>{
  for(const platform of ['win32','linux']) {
    const f=await fixture(platform);f.options.keyEntry='masked';await module.runGuidedSetup(f.options);
    assert.equal(f.calls[0].command,platform==='win32'?'powershell.exe':'sh');
  }
});

test('host detection auto-integrates existing Codex and OpenCode without creating absent hosts',async()=>{
  const f=await fixture();
  await mkdir(join(f.options.home,'.codex'),{recursive:true});
  await writeFile(join(f.options.home,'.codex/config.toml'),'model = "user-choice"\n');
  await mkdir(join(f.options.home,'.config/opencode'),{recursive:true});
  await writeFile(join(f.options.home,'.config/opencode/opencode.json'),JSON.stringify({theme:'dark'}));
  const detected=await module.detectInstalledHosts({home:f.options.home,platform:'win32',env:{PATH:''},cwd:f.root});
  assert.equal(detected.codex.installed,true); assert.equal(detected.opencode.installed,true); assert.equal(detected.antigravity.installed,false);
  const result=await module.integrateDetectedHosts({root:f.root,node:process.execPath,home:f.options.home,platform:'win32',env:{PATH:''},detected,tell:()=>{}});
  assert.deepEqual(result.integrated.map(item=>item.target).sort(),['codex','opencode']);
  assert.match(await readFile(join(f.options.home,'.codex/config.toml'),'utf8'),/user-choice/);
  await access(join(f.options.home,'.codex/skills/tdd-workflow/SKILL.md'));
  await access(join(f.options.home,'.config/opencode/skills/tdd-workflow/SKILL.md'));
});

test('one-click setup opens the shared browser sign-in window and enables the provider/autostart path automatically',async()=>{
  const f=await fixture('win32',['','yes']);
  f.options.browserConsumers=true;
  const result=await module.runGuidedSetup(f.options);
  assert.equal(result.status,'launched');
  assert.equal(f.calls.length,5);
  const bridge=join(f.root,'versions/0.2.1-test/app/distribution/browser-consumer-setup.mjs');
  assert.deepEqual(f.calls[1],{command:'fixture-node',args:[bridge,'launch','--root',f.root]});
  assert.deepEqual(f.calls[2],{command:'fixture-node',args:[bridge,'enable','--root',f.root]});
  assert.ok(f.calls[3].args.includes('--dry-run'));
  assert.ok(f.calls[4].args.includes('--apply'));
  assert.ok(f.messages.some(text=>text.includes('six consumer sign-in tabs')));
});
