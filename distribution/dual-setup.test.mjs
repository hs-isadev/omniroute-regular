import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const mod=await import('./dual-setup.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
test('global Antigravity setup is repeatable and preserves unrelated MCP entries and rules',async()=>{
  assert.equal(typeof mod.connectAntigravity,'function','combined global connector missing');
  const home=await mkdtemp(join(tmpdir(),'dual-host-')),root=join(home,'install');await mkdir(join(home,'.gemini/config'),{recursive:true});
  const path=join(home,'.gemini/config/mcp_config.json');await writeFile(path,JSON.stringify({mcpServers:{existing:{command:'keep'}}}));await writeFile(join(home,'.gemini/GEMINI.md'),'Existing rules\n');
  const options={home,root,node:process.execPath,entrypoint:join(home,'server.mjs')};
  await mod.connectAntigravity(options);const before=await readFile(path,'utf8');await mod.connectAntigravity(options);
  assert.equal(await readFile(path,'utf8'),before);assert.equal(JSON.parse(before).mcpServers.existing.command,'keep');
  assert.match(await readFile(join(home,'.gemini/GEMINI.md'),'utf8'),/^Existing rules/);
  await writeFile(path,JSON.stringify({mcpServers:{omniroute_regular:{command:'user-owned'}}}));
  await assert.rejects(mod.connectAntigravity(options),/conflict/i);
});
test('OpenCode environment excludes upstream credentials and points both models at local router',()=>{
  assert.equal(typeof mod.openCodeEnvironment,'function','isolated environment missing');
  const env=mod.openCodeEnvironment({PATH:'fixture',HOME:'/user',GROQ_API_KEY:'never-forward',NODE_OPTIONS:'--require evil'},'/install','{}');
  assert.equal(env.GROQ_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.OPENCODE_CONFIG_CONTENT,'{}');assert.match(env.XDG_CONFIG_HOME,/opencode/);assert.equal(env.OPENCODE_DISABLE_MODELS_FETCH,'true');
});
test('installer entrypoints include user-friendly editor workflow and no GitHub publication',async()=>{
  const path=new URL('./dual/Setup.ps1',import.meta.url);
  const ps=await readFile(path,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '';});
  assert.match(ps,/dual-setup/);assert.match(ps,/setup/);assert.doesNotMatch(ps,/git push|gh release|curl.*\|/);
  const sh=await readFile(new URL('./dual/Setup.sh',import.meta.url),'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '';});
  assert.match(sh,/dual-setup/);assert.match(sh,/secret-tool/);assert.doesNotMatch(sh,/--no-sandbox/);
});
test('new setup saves keys before starting Antigravity so its MCP sees the saved profile',async()=>{
  const source=await readFile(new URL('./dual-setup.mjs',import.meta.url),'utf8');
  const setup=source.slice(source.indexOf('export async function setupBoth'));
  assert.ok(setup.indexOf('await openKeyForm(root)')<setup.indexOf('await launchAntigravity(root)'));
});
