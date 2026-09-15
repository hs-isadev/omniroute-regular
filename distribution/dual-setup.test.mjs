import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getRuntimePaths,loadConfig,saveConfig} from '../packages/config/dist/index.js';
import {regularConfig} from './settings.mjs';
const mod=await import('./dual-setup.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
test('global Antigravity setup is repeatable and preserves unrelated MCP entries and rules',async()=>{
  assert.equal(typeof mod.connectAntigravity,'function','combined global connector missing');
  const home=await mkdtemp(join(tmpdir(),'dual-host-')),root=join(home,'install');await mkdir(join(home,'.gemini/config'),{recursive:true});
  const path=join(home,'.gemini/config/mcp_config.json');await writeFile(path,JSON.stringify({mcpServers:{existing:{command:'keep'}}}));await writeFile(join(home,'.gemini/GEMINI.md'),'Existing rules\n');
  const entrypoint=join(home,'server.mjs');await writeFile(entrypoint,'// fixture');
  const options={home,root,node:process.execPath,entrypoint};
  await mod.connectAntigravity(options);const before=await readFile(path,'utf8');await mod.connectAntigravity(options);
  assert.equal(await readFile(path,'utf8'),before);assert.equal(JSON.parse(before).mcpServers.existing.command,'keep');
  assert.match(await readFile(join(home,'.gemini/GEMINI.md'),'utf8'),/^Existing rules/);
  await writeFile(path,JSON.stringify({mcpServers:{omniroute_regular:{command:'user-owned'}}}));
  await assert.rejects(mod.connectAntigravity(options),/conflict/i);
});
test('global Antigravity setup refuses missing runtime files before registration',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-host-missing-')),root=join(home,'install');
  const configPath=join(home,'.gemini/config/mcp_config.json');
  await assert.rejects(mod.connectAntigravity({home,root,node:join(home,'missing-node.exe'),entrypoint:join(home,'missing-server.mjs')}),/runtime|executable|entrypoint|missing/i);
  await assert.rejects(readFile(configPath,'utf8'),/ENOENT/);
});

test('active runtime resolution follows the installed marker and supports spaces',async()=>{
  assert.equal(typeof mod.resolveActiveRuntime,'function','active runtime resolver missing');
  const root=await mkdtemp(join(tmpdir(),'OmniRoute Install With Spaces '));
  const active='versions/0.6.5-private.1-fixture',payload=join(root,active);
  const node=join(payload,'node',process.platform==='win32'?'node.exe':'node');
  const entrypoint=join(payload,'app/distribution/mcp-regular.mjs');
  await mkdir(join(payload,'node'),{recursive:true});await mkdir(join(payload,'app/distribution'),{recursive:true});
  await writeFile(node,'fixture');await writeFile(entrypoint,'fixture');await writeFile(join(root,'active-version.txt'),active+'\n');
  assert.deepEqual(await mod.resolveActiveRuntime(root),{active,payload,node,entrypoint});
  await writeFile(join(root,'active-version.txt'),'versions/stale-missing\n');
  await assert.rejects(mod.resolveActiveRuntime(root),/missing|unhealthy|runtime/i);
});

test('host registration repair follows active-version through update and rollback',async()=>{
  assert.equal(typeof mod.repairHostRegistrations,'function','host repair helper missing');
  const home=await mkdtemp(join(tmpdir(),'dual-host-cycle-')),root=join(home,'Install With Spaces');
  const makeRuntime=async active=>{
    const payload=join(root,active),node=join(payload,'node',process.platform==='win32'?'node.exe':'node'),entrypoint=join(payload,'app/distribution/mcp-regular.mjs');
    await mkdir(join(payload,'node'),{recursive:true});await mkdir(join(payload,'app/distribution'),{recursive:true});
    await writeFile(node,'fixture');await writeFile(entrypoint,'fixture');return {node,entrypoint};
  };
  const oldActive='versions/0.6.4-private.1-old',newActive='versions/0.6.5-private.1-new';
  const oldRuntime=await makeRuntime(oldActive),newRuntime=await makeRuntime(newActive);
  const configPath=join(home,'.gemini/config/mcp_config.json');
  for(const [active,expected] of [[oldActive,oldRuntime],[newActive,newRuntime],[oldActive,oldRuntime]]){
    await mkdir(root,{recursive:true});await writeFile(join(root,'active-version.txt'),active+'\n');
    await mod.repairHostRegistrations({root,home});
    const entry=JSON.parse(await readFile(configPath,'utf8')).mcpServers.omniroute_regular;
    assert.equal(entry.command,expected.node);assert.deepEqual(entry.args,[expected.entrypoint]);
    const openCode=JSON.parse(await readFile(join(home,'.config/opencode/opencode.json'),'utf8')).mcp.omniroute;
    assert.deepEqual(openCode.command,[expected.node,expected.entrypoint,'mcp']);
    assert.equal(openCode.enabled,true);assert.equal(openCode.environment.OMNIROUTE_MANAGED,'1');
    assert.equal(openCode.environment.OMNIROUTE_HOME,join(root,'data'));
    assert.equal(openCode.environment.OMNIROUTE_ROUTING_MODE,'regular');
  }
});
test('host registration repair updates enabled browser consumers to the active runtime without changing policy fields',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-consumer-cycle-')),root=join(home,'Install With Spaces'),active='versions/0.6.5-private.1-new',payload=join(root,active);
  const node=join(payload,'node',process.platform==='win32'?'node.exe':'node'),mcp=join(payload,'app/distribution/mcp-regular.mjs');
  const claude=join(payload,'app/packages/claude-consumer-adapter/src/adapter.mjs'),zai=join(payload,'app/packages/zai-consumer-adapter/src/adapter.mjs'),browser=join(payload,'app/packages/browser-consumer-adapter/src/adapter.mjs');
  for(const file of [node,mcp,claude,zai,browser]){await mkdir(join(file,'..'),{recursive:true});await writeFile(file,'fixture');}
  await writeFile(join(root,'active-version.txt'),active+'\n');
  const paths=getRuntimePaths(join(root,'data')),config=regularConfig();for(const provider of config.providers)provider.enabled=false;
  const enabled=config.providers.find(provider=>provider.id==='qwen-consumer');enabled.enabled=true;enabled.freeTierConfirmed=true;enabled.mcpCommand=join(root,'versions/0.6.4-private.1-old/node/node.exe');enabled.mcpArgs=[join(root,'versions/0.6.4-private.1-old/app/packages/browser-consumer-adapter/src/adapter.mjs'),'--provider','qwen','--endpoint',enabled.baseUrl];enabled.mcpWorkingDirectory=join(root,'versions/0.6.4-private.1-old/app/packages/browser-consumer-adapter/src');
  const preserved={baseUrl:enabled.baseUrl,maxTaskClass:enabled.maxTaskClass,models:structuredClone(enabled.models)};await saveConfig(config,paths);
  await mod.repairHostRegistrations({root,home});
  const repaired=(await loadConfig(paths)).providers.find(provider=>provider.id==='qwen-consumer');
  assert.equal(repaired.mcpCommand,node);assert.deepEqual(repaired.mcpArgs,[browser,'--provider','qwen','--endpoint',preserved.baseUrl]);assert.equal(repaired.mcpWorkingDirectory,join(browser,'..'));
  assert.equal(repaired.enabled,true);assert.equal(repaired.baseUrl,preserved.baseUrl);assert.equal(repaired.maxTaskClass,preserved.maxTaskClass);assert.deepEqual(repaired.models,preserved.models);
});
test('host registration repair refreshes an existing browser-consumer startup command to the active runtime',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-autostart-cycle-')),root=join(home,'Install With Spaces'),active='versions/0.6.5-private.1-new',payload=join(root,active),appData=join(home,'AppData/Roaming');
  const node=join(payload,'node',process.platform==='win32'?'node.exe':'node'),mcp=join(payload,'app/distribution/mcp-regular.mjs'),shared=join(payload,'app/packages/browser-consumer-adapter/src/shared-session.mjs');
  for(const file of [node,mcp,shared]){await mkdir(join(file,'..'),{recursive:true});await writeFile(file,'fixture');}
  await writeFile(join(root,'active-version.txt'),active+'\n');
  const startup=join(appData,'Microsoft/Windows/Start Menu/Programs/Startup');await mkdir(startup,{recursive:true});
  const vbs=join(startup,'OmniRoute Browser Consumers.vbs'),old=join(root,'versions/0.6.4-private.1-old');
  await writeFile(vbs,`CreateObject("WScript.Shell").Run """${join(old,'node/node.exe')}"" ""${join(old,'app/packages/browser-consumer-adapter/runtime/shared-session.mjs')}"" --background --profile ""${join(root,'data/browser-consumer-profile')}"" --port 47842", 0, False\r\n`);
  await mod.repairHostRegistrations({root,home,env:{APPDATA:appData}});
  const repaired=await readFile(vbs,'utf8');assert.match(repaired,new RegExp(node.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&')));assert.match(repaired,new RegExp(shared.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&')));assert.doesNotMatch(repaired,/0\.6\.4-private/);
});
test('OpenCode environment excludes upstream credentials and points both models at local router',()=>{
  assert.equal(typeof mod.openCodeEnvironment,'function','isolated environment missing');
  const env=mod.openCodeEnvironment({PATH:'fixture',HOME:'/user',GROQ_API_KEY:'never-forward',NODE_OPTIONS:'--require evil'},'/install','{}');
  assert.equal(env.GROQ_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.OPENCODE_CONFIG_CONTENT,'{}');assert.match(env.XDG_CONFIG_HOME,/opencode/);assert.equal(env.OPENCODE_DISABLE_MODELS_FETCH,'true');
});
test('one setup connects OpenCode, Codex, and Claude Code to the isolated regular MCP without replacing user settings',async()=>{
  assert.equal(typeof mod.connectDeveloperHosts,'function','developer-host connector missing');
  const home=await mkdtemp(join(tmpdir(),'dual-dev-hosts-')),root=join(home,'install');await mkdir(root,{recursive:true});
  await mkdir(join(home,'.codex'),{recursive:true});await mkdir(join(home,'.claude'),{recursive:true});await mkdir(join(home,'.config/opencode'),{recursive:true});
  await writeFile(join(home,'.codex/config.toml'),'model = "user-choice"\n');
  await writeFile(join(home,'.claude.json'),JSON.stringify({theme:'dark'}));
  await writeFile(join(home,'.config/opencode/opencode.json'),JSON.stringify({theme:'dark',mcp:{existing:{type:'remote',url:'https://example.invalid'}}}));
  const result=await mod.connectDeveloperHosts({home,root,node:process.execPath,entrypoint:join(home,'mcp-regular.mjs')});
  assert.deepEqual(result.connected.sort(),['claude-code','codex','opencode']);
  const codex=await readFile(join(home,'.codex/config.toml'),'utf8');assert.match(codex,/user-choice/);assert.match(codex,/OMNIROUTE_HOME/);
  const claude=JSON.parse(await readFile(join(home,'.claude.json'),'utf8'));assert.equal(claude.theme,'dark');assert.equal(claude.mcpServers.omniroute.env.OMNIROUTE_ROUTING_MODE,'regular');
  const openCode=JSON.parse(await readFile(join(home,'.config/opencode/opencode.json'),'utf8'));assert.equal(openCode.theme,'dark');assert.equal(openCode.mcp.existing.url,'https://example.invalid');assert.deepEqual(openCode.mcp.omniroute.command,[process.execPath,join(home,'mcp-regular.mjs'),'mcp']);
  await mod.connectDeveloperHosts({home,root,node:process.execPath,entrypoint:join(home,'mcp-regular.mjs')});
});
test('installer entrypoints include user-friendly editor workflow and no GitHub publication',async()=>{
  const path=new URL('./dual/Setup.ps1',import.meta.url);
  const ps=await readFile(path,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '';});
  assert.match(ps,/dual-setup/);assert.match(ps,/setup/);assert.doesNotMatch(ps,/git push|gh release|curl.*\|/);
  const sh=await readFile(new URL('./dual/Setup.sh',import.meta.url),'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '';});
  assert.match(sh,/dual-setup/);assert.match(sh,/secret-tool/);assert.doesNotMatch(sh,/--no-sandbox/);
  const managePs=await readFile(new URL('./dual/Manage.ps1',import.meta.url),'utf8');
  const manageSh=await readFile(new URL('./dual/Manage.sh',import.meta.url),'utf8');
  assert.match(managePs,/repair-hosts/);assert.match(managePs,/\$active\+'\/app\/distribution\/dual-setup\.mjs'/);
  assert.match(manageSh,/repair-hosts/);assert.match(manageSh,/\$active\/app\/distribution\/dual-setup\.mjs/);
});
test('new setup saves keys before starting Antigravity so its MCP sees the saved profile',async()=>{
  const source=await readFile(new URL('./dual-setup.mjs',import.meta.url),'utf8');
  const setup=source.slice(source.indexOf('export async function setupBoth'));
  assert.ok(setup.indexOf('await openKeyForm(root)')<setup.indexOf('await launchAntigravity(root)'));
});

test('Antigravity launch reports an immediate desktop-process exit instead of claiming it opened',async()=>{
  assert.equal(typeof mod.launchAntigravity,'function','Antigravity launcher missing');
  const home=await mkdtemp(join(tmpdir(),'dual-antigravity-launch-')),root=join(home,'install'),app=join(home,'Antigravity.exe');
  await mkdir(root,{recursive:true});await writeFile(app,'fixture');await writeFile(join(root,'antigravity-path.txt'),app+'\n');
  const child=new EventEmitter();child.unref=()=>{};
  const launch=mod.launchAntigravity(root,{spawnImpl:()=>{queueMicrotask(()=>child.emit('exit',0x80000003));return child;},startupWaitMs:0});
  await assert.rejects(launch,/Antigravity.*exited.*0x80000003/i);
});

test('release setup enables the packaged Claude consumer without storing a credential',async()=>{
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

test('one-click setup enables a separate packaged Z.AI browser consumer without storing a credential',async()=>{
  assert.equal(typeof mod.configureZaiConsumer,'function','Z.AI consumer setup missing');
  const root=await mkdtemp(join(tmpdir(),'dual-zai-'));
  const paths=getRuntimePaths(join(root,'data'));
  const config=regularConfig();
  await saveConfig(config,paths);
  const node=join(root,'versions/0.5.0/node/node.exe');
  const entrypoint=join(root,'versions/0.5.0/app/packages/zai-consumer-adapter/src/adapter.mjs');
  await mod.configureZaiConsumer({root,node,entrypoint});
  const saved=await loadConfig(paths);
  const provider=saved.providers.find(item=>item.id==='zai-consumer');
  assert.equal(provider.enabled,true);
  assert.equal(provider.credentialField,null);
  assert.equal(provider.mcpCommand,node);
  assert.deepEqual(provider.mcpArgs,[entrypoint,'--endpoint','http://127.0.0.1:47842']);
  assert.equal(saved.routing.directProviderOrder[1],'zai-consumer');
  assert.equal(saved.providers.find(item=>item.id==='zai').type,'openai-compatible');
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

test('Z.AI consumer gets its own profile, port, and per-user background autostart',async()=>{
  assert.equal(typeof mod.installZaiConsumerAutostart,'function','Z.AI consumer autostart missing');
  const home=await mkdtemp(join(tmpdir(),'dual-zai-autostart-'));
  const root=join(home,'install'),node=join(root,'node'),entrypoint=join(root,'zai-credential-server.mjs');
  const result=await mod.installZaiConsumerAutostart({platform:'linux',home,root,node,entrypoint});
  const text=await readFile(result.file,'utf8');
  assert.match(text,/X-GNOME-Autostart-enabled=true/);
  assert.match(text,/--background/);
  assert.match(text,/zai-consumer-profile/);
  assert.match(text,/--port 47843/);
  assert.doesNotMatch(text,/cookie|token|password/i);
});

test('Windows Z.AI autostart is hidden, profile-isolated, and contains no account data',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-zai-win-autostart-'));
  const root=join(home,'install'),node=join(root,'node.exe'),entrypoint=join(root,'zai-credential-server.mjs');
  const appData=join(home,'AppData/Roaming');
  const result=await mod.installZaiConsumerAutostart({platform:'win32',home,root,node,entrypoint,env:{APPDATA:appData}});
  const text=await readFile(result.file,'utf8');
  assert.match(result.file,/OmniRoute Z\.AI Consumer\.vbs$/);
  assert.match(text,/--background/);
  assert.match(text,/zai-consumer-profile/);
  assert.match(text,/--port 47843/);
  assert.match(text,/, 0, False/);
  assert.doesNotMatch(text,/cookie|token|password/i);
});

test('browser bootstrap commands disconnect their CDP clients and let one-click setup continue',async()=>{
  for(const relative of ['../packages/claude-consumer-adapter/src/credential-server.mjs','../packages/zai-consumer-adapter/src/credential-server.mjs']){
    const source=await readFile(new URL(relative,import.meta.url),'utf8');
    assert.match(source,/start\(\)\.then\(\(\)=>process\.exit\(0\)\)/,relative);
    assert.match(source,/await waitForConsumerAuthentication\(/,relative);
    assert.match(source,/await minimizeBrowserWindow\(/,relative);
  }
});

test('combined setup keeps the original pair helper and starts all browser consumers after BYOK key setup',async()=>{
  assert.equal(typeof mod.launchConsumerSetups,'function','concurrent browser setup helper missing');
  const started=[];
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const pending=mod.launchConsumerSetups('/install',{
    launchClaude:async root=>{started.push(['claude',root]);await gate;},
    launchZai:async root=>{started.push(['zai',root]);await gate;},
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(started,[['claude','/install'],['zai','/install']]);
  release();await pending;
  const source=await readFile(new URL('./dual-setup.mjs',import.meta.url),'utf8');
  const setup=source.slice(source.indexOf('export async function setupBoth'));
  for(const call of ['configureClaudeConsumer','configureZaiConsumer','configurePrivateBrowserConsumers','installSharedBrowserConsumerAutostart','launchSharedBrowserConsumerSetup']) assert.match(setup,new RegExp(`await ${call}\\(`),call);
  assert.ok(setup.indexOf('await openKeyForm(root)')<setup.indexOf('await launchSharedBrowserConsumerSetup(root)'));
});

test('release package includes both browser adapters and marks six integrated routes',async()=>{
  const source=await readFile(new URL('../scripts/package-dual.mjs',import.meta.url),'utf8').catch(error=>{
    if(error.code!=='ENOENT')throw error;
    return null;
  });
  if(source!==null){
    assert.match(source,/version='0\.5\.1'/);
    assert.match(source,/claude-consumer-adapter/);
    assert.match(source,/claude-web-consumer/);
    assert.match(source,/zai-consumer-adapter/);
    assert.match(source,/glm-web-consumer/);
    assert.match(source,/playwright-core/);
  }else{
    const adapter=await readFile(new URL('../packages/claude-consumer-adapter/src/adapter.mjs',import.meta.url),'utf8');
    assert.match(adapter,/playwright/);
    assert.match(adapter,/claude-web-consumer/);
    const zaiAdapter=await readFile(new URL('../packages/zai-consumer-adapter/src/adapter.mjs',import.meta.url),'utf8');
    assert.match(zaiAdapter,/glm-web-consumer/);
    assert.match(await readFile(new URL('../node_modules/playwright-core/package.json',import.meta.url),'utf8'),/playwright-core/);
  }
});
