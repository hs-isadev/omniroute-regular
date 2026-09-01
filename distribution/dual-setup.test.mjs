import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getRuntimePaths,loadConfig,saveConfig} from '../packages/config/dist/index.js';
import {regularConfig} from './settings.mjs';
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
test('one setup connects Codex and Claude Code to the isolated regular MCP without replacing user settings',async()=>{
  assert.equal(typeof mod.connectDeveloperHosts,'function','Codex/Claude connector missing');
  const home=await mkdtemp(join(tmpdir(),'dual-dev-hosts-')),root=join(home,'install');await mkdir(root,{recursive:true});
  await mkdir(join(home,'.codex'),{recursive:true});await mkdir(join(home,'.claude'),{recursive:true});
  await writeFile(join(home,'.codex/config.toml'),'model = "user-choice"\n');
  await writeFile(join(home,'.claude.json'),JSON.stringify({theme:'dark'}));
  const result=await mod.connectDeveloperHosts({home,root,node:process.execPath,entrypoint:join(home,'mcp-regular.mjs')});
  assert.deepEqual(result.connected.sort(),['claude-code','codex']);
  const codex=await readFile(join(home,'.codex/config.toml'),'utf8');assert.match(codex,/user-choice/);assert.match(codex,/OMNIROUTE_HOME/);
  const claude=JSON.parse(await readFile(join(home,'.claude.json'),'utf8'));assert.equal(claude.theme,'dark');assert.equal(claude.mcpServers.omniroute.env.OMNIROUTE_ROUTING_MODE,'regular');
  await mod.connectDeveloperHosts({home,root,node:process.execPath,entrypoint:join(home,'mcp-regular.mjs')});
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

test('experiment setup enables the packaged Claude consumer without storing a credential',async()=>{
  assert.equal(typeof mod.configureClaudeConsumer,'function','Claude consumer setup missing');
  const root=await mkdtemp(join(tmpdir(),'dual-claude-'));
  const paths=getRuntimePaths(join(root,'data'));
  const config=regularConfig();
  await saveConfig(config,paths);
  const node=join(root,'versions/0.5.0/node/node.exe');
  const entrypoint=join(root,'versions/0.5.0/app/packages/claude-consumer-adapter/src/adapter.mjs');
  await mod.configureClaudeConsumer({root,node,entrypoint});
  const saved=await loadConfig(paths);
  const provider=saved.providers.find(item=>item.id==='claude-consumer');
  assert.equal(provider.enabled,true);
  assert.equal(provider.credentialField,null);
  assert.equal(provider.mcpCommand,node);
  assert.deepEqual(provider.mcpArgs,[entrypoint,'--endpoint','http://127.0.0.1:47842']);
  assert.equal(saved.routing.directProviderOrder[0],'claude-consumer');
});

test('consumer autostart is per-user, background, and contains no account data',async()=>{
  assert.equal(typeof mod.installClaudeConsumerAutostart,'function','Claude consumer autostart missing');
  const home=await mkdtemp(join(tmpdir(),'dual-autostart-'));
  const root=join(home,'install'),node=join(root,'node'),entrypoint=join(root,'credential-server.mjs');
  const result=await mod.installClaudeConsumerAutostart({platform:'linux',home,root,node,entrypoint});
  const text=await readFile(result.file,'utf8');
  assert.match(text,/X-GNOME-Autostart-enabled=true/);
  assert.match(text,/--background/);
  assert.match(text,/--profile/);
  assert.match(text,/claude-consumer-profile/);
  assert.match(text,/--port 47842/);
  assert.doesNotMatch(text,/cookie|token|password/i);
});

test('experiment package includes the adapter and marks five integrated routes',async()=>{
  const source=await readFile(new URL('../scripts/package-dual.mjs',import.meta.url),'utf8');
  assert.match(source,/claude-consumer-adapter/);
  assert.match(source,/claude-web-consumer/);
  assert.match(source,/playwright-core/);
});
