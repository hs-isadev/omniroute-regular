import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, access, symlink, link, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getRuntimePaths } from '../packages/config/dist/index.js';
import { InMemoryKeyProtector, SecretVault } from '../packages/vault/dist/index.js';
import { configure } from './settings.mjs';
const editor=await import('./key-editor.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
const requireEditor=()=>assert.equal(typeof editor.prepareKeyFile,'function','editor import is not implemented');
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'omni-key-editor-'));
  return {root,dir:join(root,'private-input'),paths:getRuntimePaths(join(root,'runtime')),protector:new InMemoryKeyProtector(Buffer.alloc(32,11)),factory:()=>({generate:async()=>({text:'OK'})})};
}
test('template marks saved providers without exporting keys and excludes credit providers',async()=>{
  requireEditor();const f=await fixture();
  await configure({keys:{GROQ_API_KEY:'fixture-never-export'},freeOnlyConfirmed:true},f.paths,f);
  const file=await editor.prepareKeyFile(f);const text=await readFile(file,'utf8');
  assert.match(text,/# groq: saved/);assert.match(text,/GROQ_API_KEY=\r?\n/);
  assert.doesNotMatch(text,/fixture-never-export|HF_TOKEN=|VERCEL_AI_GATEWAY_API_KEY=/);
  assert.match(text,/https:\/\/console.groq.com\/keys/);
});
test('existing populated edits are preserved exactly, and parser rejects unsafe fields without echo',async()=>{
  requireEditor();const f=await fixture();const file=await editor.prepareKeyFile(f);
  const text='GROQ_API_KEY=fixture-pending\n';await writeFile(file,text);
  await editor.prepareKeyFile(f);assert.equal(await readFile(file,'utf8'),text);
  for(const value of ['GROQ_API_KEY=\nGROQ_API_KEY=x','fixture-secret-unknown=x','GROQ_API_KEY=x\0','GROQ_API_KEY='+ 'x'.repeat(4097),'HF_TOKEN=x']) {
    assert.throws(()=>editor.parseKeyFile(value),e=>!e.message.includes('fixture-secret-unknown'));
  }
  assert.equal(editor.parseKeyFile('\uFEFF# comment\r\nGROQ_API_KEY="fixture=a"\r\n').GROQ_API_KEY,'fixture=a');
  assert.deepEqual(editor.parseKeyFile('GROQ_API_KEY=\n'),{});
});
test('full import encrypts keys and clears plaintext; blank repeat retains saved keys',async()=>{
  requireEditor();const f=await fixture();const file=await editor.prepareKeyFile(f);
  await writeFile(file,'GROQ_API_KEY=fixture-import\n');
  const result=await editor.importKeyFile({...f,file,freeOnlyConfirmed:true});assert.equal(result.ready,true);
  assert.doesNotMatch(await readFile(file,'utf8'),/fixture-import/);
  assert.doesNotMatch(await readFile(f.paths.vault,'utf8'),/fixture-import/);
  await editor.importKeyFile({...f,file,freeOnlyConfirmed:true});
  const vault=await SecretVault.load(f.paths.vault,f.protector);assert.equal(vault.get('groq').GROQ_API_KEY,'fixture-import');vault.dispose();
});
test('failed validation retains file and vault; partial success keeps only failed input',async()=>{
  requireEditor();const f=await fixture();const file=await editor.prepareKeyFile(f);
  await writeFile(file,'GROQ_API_KEY=fixture-bad\n');
  const failure=()=>({generate:async()=>{throw Error('fixture-bad');}});
  await assert.rejects(editor.importKeyFile({...f,file,freeOnlyConfirmed:true,factory:failure}),/validation failed/);
  assert.match(await readFile(file,'utf8'),/fixture-bad/);await assert.rejects(access(f.paths.vault),/ENOENT/);
  await writeFile(file,'GROQ_API_KEY=fixture-good\nZAI_API_KEY=fixture-bad\n');
  const result=await editor.importKeyFile({...f,file,freeOnlyConfirmed:true,factory:p=>p.id==='groq'?f.factory():failure()});
  assert.deepEqual(result.failed,['zai']);const text=await readFile(file,'utf8');
  assert.match(text,/ZAI_API_KEY=fixture-bad/);assert.doesNotMatch(text,/fixture-good/);
});
test('confirmation is mandatory and concurrent edits are never overwritten',async()=>{
  requireEditor();const f=await fixture();const file=await editor.prepareKeyFile(f);
  await writeFile(file,'GROQ_API_KEY=fixture-first\n');
  await assert.rejects(editor.importKeyFile({...f,file}),/Confirm/);
  let changed=false;
  await assert.rejects(editor.importKeyFile({...f,file,freeOnlyConfirmed:true,factory:()=>({generate:async()=>{if(!changed){changed=true;await writeFile(file,'GROQ_API_KEY=fixture-new-edit\n');}return {text:'OK'};}})}),/changed|cleanup/i);
  assert.match(await readFile(file,'utf8'),/fixture-new-edit/);
});
test('import rejects repository/sync locations, hardlinks, oversized files and symlink paths',async()=>{
  requireEditor();const f=await fixture();await mkdir(join(f.root,'.git'));
  await assert.rejects(editor.prepareKeyFile(f),/repository/i);
  const clean=await fixture();await assert.rejects(editor.prepareKeyFile({...clean,dir:join(clean.root,'OneDrive','input')}),/sync/i);
  const file=await editor.prepareKeyFile(clean);const hard=join(clean.dir,'hard.txt');await link(file,hard);
  await assert.rejects(editor.importKeyFile({...clean,file,freeOnlyConfirmed:true}),/link/i);
  const large=await fixture();const largeFile=await editor.prepareKeyFile(large);await writeFile(largeFile,'x'.repeat(65537));
  await assert.rejects(editor.importKeyFile({...large,file:largeFile,freeOnlyConfirmed:true}),/large/i);
  const linked=await fixture();const target=join(linked.root,'target');await mkdir(target);
  await symlink(target,linked.dir,process.platform==='win32'?'junction':'dir');
  await assert.rejects(editor.prepareKeyFile(linked),/link|reparse/i);
});
test('Linux template permissions are private',{skip:process.platform==='win32'},async()=>{
  requireEditor();const f=await fixture();const file=await editor.prepareKeyFile(f);
  assert.equal((await stat(f.dir)).mode&0o777,0o700);assert.equal((await stat(file)).mode&0o777,0o600);
});
