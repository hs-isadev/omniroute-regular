import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {getRuntimePaths,loadConfig,saveConfig} from '../packages/config/dist/index.js';
import {regularConfig} from './settings.mjs';
const mod=await import('./dual-setup.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
test('the selected portable workflow skills install globally and user-owned collisions are preserved',async()=>{
  assert.equal(typeof mod.installBundledSkills,'function','global skill installer missing');
  const home=await mkdtemp(join(tmpdir(),'dual-skills-'));
  const names=['focused-implementation','focused-code-review','root-cause-debug','verify-change','tdd-workflow','coding-standards','search-first','security-review','context-budget','omniroute-first-delegation','github-package-release'];
  const collision=join(home,'.codex/skills',names[0],'SKILL.md'),custom='---\nname: focused-implementation\ndescription: My existing skill\n---\nKeep this file.\n';
  await mkdir(dirname(collision),{recursive:true});await writeFile(collision,custom);
  const first=await mod.installBundledSkills({home});
  assert.deepEqual(first.skillNames,names);
  assert.deepEqual(first.newlyInstalledByHost,{codex:10,opencode:11,antigravity:11});
  assert.deepEqual(first.availableByHost,{codex:10,opencode:11,antigravity:11});
  assert.deepEqual(first.preservedConflicts,[{host:'codex',skill:names[0]}]);
  assert.equal(await readFile(collision,'utf8'),custom);
  for(const [host,path] of [['codex','.codex/skills'],['opencode','.config/opencode/skills'],['antigravity','.gemini/config/skills']]){
    for(const name of names){
      if(host==='codex'&&name===names[0])continue;
      const content=await readFile(join(home,path,name,'SKILL.md'),'utf8');
      assert.match(content,new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`));
      assert.doesNotMatch(content,/^compatibility:\s*opencode\s*$/m);
    }
  }
  const second=await mod.installBundledSkills({home});
  assert.deepEqual(second.newlyInstalledByHost,{codex:0,opencode:0,antigravity:0});
  assert.equal(await readFile(collision,'utf8'),custom);
});
test('OmniRoute-first global instructions install safely and idempotently for Codex and OpenCode',async()=>{
  assert.equal(typeof mod.installOmniRouteGlobalRules,'function','global routing-rule installer missing');
  const home=await mkdtemp(join(tmpdir(),'dual-global-rules-'));
  const codex=join(home,'.codex/AGENTS.md');await mkdir(dirname(codex),{recursive:true});await writeFile(codex,'My existing Codex preferences.\n');
  const first=await mod.installOmniRouteGlobalRules({home});
  assert.deepEqual(first.installedHosts,['codex','opencode']);
  assert.deepEqual(first.preservedConflicts,[]);
  const beforeCodex=await readFile(codex,'utf8'),opencode=await readFile(join(home,'.config/opencode/AGENTS.md'),'utf8');
  assert.match(beforeCodex,/My existing Codex preferences/);
  for(const content of [beforeCodex,opencode]){
    assert.match(content,/BEGIN OMNIROUTE REGULAR GLOBAL ROUTING/);
    assert.match(content,/routingMode="regular"/);
    assert.match(content,/Never send credentials/i);
  }
  const second=await mod.installOmniRouteGlobalRules({home});
  assert.deepEqual(second.alreadyConfiguredHosts,['codex','opencode']);
  assert.equal(await readFile(codex,'utf8'),beforeCodex);
  const edited=beforeCodex.replace("Use OmniRoute's configured MCP","Use my chosen router");await writeFile(codex,edited);
  const third=await mod.installOmniRouteGlobalRules({home});
  assert.deepEqual(third.preservedConflicts,[{host:'codex'}]);
  assert.equal(await readFile(codex,'utf8'),edited);
});
test('global Antigravity setup is repeatable and preserves unrelated MCP entries and rules',async()=>{
  assert.equal(typeof mod.connectAntigravity,'function','combined global connector missing');
  const home=await mkdtemp(join(tmpdir(),'dual-host-')),root=join(home,'install');await mkdir(join(home,'.gemini/config'),{recursive:true});
  const path=join(home,'.gemini/config/mcp_config.json');await writeFile(path,JSON.stringify({mcpServers:{existing:{command:'keep'}}}));await writeFile(join(home,'.gemini/GEMINI.md'),'Existing rules\n');
  const runtime=join(root,'versions/0.6.6-private.2-old'),node=join(runtime,'node',process.platform==='win32'?'node.exe':'node'),entrypoint=join(runtime,'app/distribution/mcp-regular.mjs');
  await mkdir(dirname(node),{recursive:true});await mkdir(dirname(entrypoint),{recursive:true});await writeFile(node,'fixture');await writeFile(entrypoint,'// fixture');
  const options={home,root,node,entrypoint};
  await mod.connectAntigravity(options);const before=await readFile(path,'utf8');await mod.connectAntigravity(options);
  assert.equal(await readFile(path,'utf8'),before);assert.equal(JSON.parse(before).mcpServers.existing.command,'keep');
  assert.match(await readFile(join(home,'.gemini/GEMINI.md'),'utf8'),/^Existing rules/);
  const managed=JSON.parse(await readFile(path,'utf8'));managed.mcpServers.omniroute_regular.disabled=false;
  await writeFile(path,JSON.stringify(managed));
  await mod.connectAntigravity(options);
  assert.equal(JSON.parse(await readFile(path,'utf8')).mcpServers.omniroute_regular.command,node);
  await writeFile(path,JSON.stringify({mcpServers:{omniroute_regular:{command:'user-owned'}}}));
  await assert.rejects(mod.connectAntigravity(options),/conflict/i);
});
test('global Antigravity setup accepts an empty MCP file and preserves its backup',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-host-empty-config-')),root=join(home,'install'),configDir=join(home,'.gemini/config'),path=join(configDir,'mcp_config.json'),empty='  \r\n';
  await mkdir(configDir,{recursive:true});await writeFile(path,empty);
  const runtime=join(root,'versions/0.6.6-private.11-test'),node=join(runtime,'node',process.platform==='win32'?'node.exe':'node'),entrypoint=join(runtime,'app/distribution/mcp-regular.mjs');
  await mkdir(dirname(node),{recursive:true});await mkdir(dirname(entrypoint),{recursive:true});await writeFile(node,'fixture');await writeFile(entrypoint,'// fixture');
  await mod.connectAntigravity({home,root,node,entrypoint});
  const saved=JSON.parse(await readFile(path,'utf8'));assert.equal(saved.mcpServers.omniroute_regular.command,node);
  const backups=(await readdir(configDir)).filter(name=>name.startsWith('mcp_config.json.backup-'));
  assert.equal(backups.length,1);assert.equal(await readFile(join(configDir,backups[0]),'utf8'),empty);
});
test('global Antigravity setup reports malformed config path without changing the file',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-host-bad-config-')),root=join(home,'install'),configDir=join(home,'.gemini/config'),path=join(configDir,'mcp_config.json'),malformed='{"mcpServers":';
  await mkdir(configDir,{recursive:true});await writeFile(path,malformed);
  const runtime=join(root,'versions/0.6.6-private.11-test'),node=join(runtime,'node',process.platform==='win32'?'node.exe':'node'),entrypoint=join(runtime,'app/distribution/mcp-regular.mjs');
  await mkdir(dirname(node),{recursive:true});await mkdir(dirname(entrypoint),{recursive:true});await writeFile(node,'fixture');await writeFile(entrypoint,'// fixture');
  await assert.rejects(mod.connectAntigravity({home,root,node,entrypoint}),error=>error.message.includes(path)&&/not valid JSON/i.test(error.message));
  assert.equal(await readFile(path,'utf8'),malformed);
});
test('setup replaces an empty OmniRoute config with disabled defaults and preserves its backup',async()=>{
  assert.equal(typeof mod.ensureSetupConfig,'function','empty config repair missing');
  const home=await mkdtemp(join(tmpdir(),'dual-setup-empty-config-')),root=join(home,'install'),paths=getRuntimePaths(join(root,'data')),empty='  \r\n';
  await mkdir(dirname(paths.config),{recursive:true});await writeFile(paths.config,empty);
  const result=await mod.ensureSetupConfig(root);assert.deepEqual(result,{changed:true,recoveredEmpty:true});
  const config=await loadConfig(paths);assert.ok(config.providers.length>0);assert.ok(config.providers.every(provider=>!provider.enabled));
  const backups=(await readdir(dirname(paths.config))).filter(name=>name.startsWith('config.json.backup-'));
  assert.equal(backups.length,1);assert.equal(await readFile(join(dirname(paths.config),backups[0]),'utf8'),empty);
});
test('setup identifies malformed OmniRoute config and preserves it unchanged',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-setup-bad-config-')),root=join(home,'install'),paths=getRuntimePaths(join(root,'data')),malformed='{"providers":';
  await mkdir(dirname(paths.config),{recursive:true});await writeFile(paths.config,malformed);
  await assert.rejects(mod.ensureSetupConfig(root),error=>error.message.includes(paths.config)&&/invalid|truncated JSON/i.test(error.message));
  assert.equal(await readFile(paths.config,'utf8'),malformed);
});
test('malformed OmniRoute config errors identify the file and leave its contents intact',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-config-parse-error-')),paths=getRuntimePaths(join(home,'install','data')),malformed='{"providers":';
  await mkdir(dirname(paths.config),{recursive:true});await writeFile(paths.config,malformed);
  await assert.rejects(loadConfig(paths),error=>error.message.includes(paths.config)&&/invalid|truncated JSON/i.test(error.message));
  assert.equal(await readFile(paths.config,'utf8'),malformed);
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
test('upgrade repair disables browser consumers, removes only OmniRoute startup entries, and preserves profiles',async()=>{
  assert.equal(typeof mod.disableBrowserConsumers,'function','browser-consumer disable migration missing');
  const home=await mkdtemp(join(tmpdir(),'dual-disable-consumers-')),root=join(home,'OmniRouteRegular');
  const paths=getRuntimePaths(join(root,'data')),config=regularConfig();
  const qwen=config.providers.find(provider=>provider.id==='qwen-consumer');qwen.enabled=true;
  config.routing.directProviderOrder=['qwen-consumer','openrouter'];await saveConfig(config,paths);
  const appData=join(home,'AppData/Roaming'),startup=join(appData,'Microsoft/Windows/Start Menu/Programs/Startup');await mkdir(startup,{recursive:true});
  const managed=join(startup,'OmniRoute Browser Consumers.vbs');
  await writeFile(managed,'CreateObject("WScript.Shell").Run "powershell.exe -File C:\\OmniRouteRegular\\Launch.ps1 -Action browser-consumers", 0, False\r\n');
  const custom=join(startup,'My own startup command.vbs');await writeFile(custom,'user-owned');
  const profile=join(root,'data/browser-consumer-profile/Default/Cookies');await mkdir(dirname(profile),{recursive:true});await writeFile(profile,'preserve sign-in data');
  const result=await mod.disableBrowserConsumers({root,home,env:{APPDATA:appData},platform:'win32'});
  const updated=await loadConfig(paths);
  assert.equal(updated.providers.find(provider=>provider.id==='qwen-consumer').enabled,false);
  assert.equal(updated.routing.directProviderOrder.includes('qwen-consumer'),false);
  await assert.rejects(readFile(managed),{code:'ENOENT'});
  assert.equal(await readFile(custom,'utf8'),'user-owned');
  assert.equal(await readFile(profile,'utf8'),'preserve sign-in data');
  assert.ok(result.removedAutostart.length>=1);
});
test('Windows repair migrates a version-pinned browser-consumer CMD when the stable VBS is missing',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-autostart-cmd-')),root=join(home,'OmniRouteRegular'),active='versions/0.6.6-private.10-new',payload=join(root,active);
  const runtime={payload,node:join(payload,'node','node.exe')},shared=join(payload,'app/packages/browser-consumer-adapter/src/shared-session.mjs');
  for(const file of [runtime.node,shared,join(root,'Launch.ps1')]){await mkdir(dirname(file),{recursive:true});await writeFile(file,'fixture');}
  const appData=join(home,'AppData/Roaming'),startup=join(appData,'Microsoft/Windows/Start Menu/Programs/Startup');await mkdir(startup,{recursive:true});
  const oldCommand=join(startup,'OmniRoute Browser Consumers.cmd'),vbs=join(startup,'OmniRoute Browser Consumers.vbs');
  await writeFile(oldCommand,'@echo off\r\nstart "" /b "C:\\Users\\test\\AppData\\Local\\OmniRouteRegular\\versions\\0.6.6-private.4-old\\node\\node.exe" "C:\\Users\\test\\AppData\\Local\\OmniRouteRegular\\versions\\0.6.6-private.4-old\\app\\packages\\browser-consumer-adapter\\runtime\\shared-session.mjs" --background --launch-only --profile "C:\\Users\\test\\AppData\\Local\\OmniRouteRegular\\data\\browser-consumer-profile" --port 47842\r\n');
  const repaired=await mod.repairBrowserConsumerAutostart({platform:'win32',root,runtime,home,env:{APPDATA:appData,SystemRoot:'C:\\Windows'}});
  assert.equal(repaired.changed,true);const stable=await readFile(vbs,'utf8');
  assert.match(stable,/Launch\.ps1/);assert.match(stable,/browser-consumers/);assert.doesNotMatch(stable,/versions[\\/]|node\.exe|shared-session\.mjs/);
  await assert.rejects(readFile(oldCommand),{code:'ENOENT'});
  const second=await mod.repairBrowserConsumerAutostart({platform:'win32',root,runtime,home,env:{APPDATA:appData,SystemRoot:'C:\\Windows'}});assert.equal(second.changed,false);
  const custom='User-managed startup command\r\n';await writeFile(oldCommand,custom);
  await assert.rejects(mod.repairBrowserConsumerAutostart({platform:'win32',root,runtime,home,env:{APPDATA:appData,SystemRoot:'C:\\Windows'}}),/autostart conflict/i);
  assert.equal(await readFile(oldCommand,'utf8'),custom);
});
test('Linux browser-consumer autostart uses the stable root launcher instead of a versioned Node path',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dual-autostart-linux-')),root=join(home,'Install With Spaces'),active='versions/0.6.5-private.1-new',payload=join(root,active);
  const node=join(payload,'node/node'),entrypoint=join(payload,'app/packages/browser-consumer-adapter/src/shared-session.mjs');
  for(const file of [node,entrypoint]){await mkdir(dirname(file),{recursive:true});await writeFile(file,'fixture');}
  await mkdir(root,{recursive:true});await writeFile(join(root,'Launch.sh'),'#!/bin/sh\n');await writeFile(join(root,'active-version.txt'),active+'\n');
  const result=await mod.installSharedBrowserConsumerAutostart({platform:'linux',home,root,node,entrypoint});
  const startup=await readFile(result.file,'utf8');assert.match(startup,/Exec=.*Launch\.sh.*browser-consumers/);assert.doesNotMatch(startup,/versions[\\/]|node\/node|shared-session\.mjs/);
});
test('OpenCode environment excludes upstream credentials and points both models at local router',()=>{
  assert.equal(typeof mod.openCodeEnvironment,'function','isolated environment missing');
  const env=mod.openCodeEnvironment({PATH:'fixture',HOME:'/user',GROQ_API_KEY:'never-forward',NODE_OPTIONS:'--require evil'},'/install','{}');
  assert.equal(env.GROQ_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.OPENCODE_CONFIG_CONTENT,'{}');assert.match(env.XDG_CONFIG_HOME,/opencode/);assert.equal(env.OPENCODE_DISABLE_MODELS_FETCH,'true');
});
test('OpenCode launcher disables session replay by default while preserving explicit arguments',()=>{
  assert.equal(typeof mod.openCodeLaunchArgs,'function','OpenCode launch argument builder missing');
  assert.deepEqual(mod.openCodeLaunchArgs([]),['--no-replay','--pure','--model','omniroute/regular']);
  assert.deepEqual(mod.openCodeLaunchArgs(['--continue','--no-replay']),['--continue','--no-replay','--pure','--model','omniroute/regular']);
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
test('Windows one-click setup installs only the current verified Devin CLI and skips optional checksum failures',async()=>{
  const bootstrap=await readFile(new URL('./dual/bootstrap.ps1',import.meta.url),'utf8');
  assert.match(bootstrap,/https:\/\/static\.devin\.ai\/cli\/devin-updater-x86_64-pc-windows\.exe/);
  assert.match(bootstrap,/C52356D07CE4E23E7768E87562FECB974EFAC6F4A65E112B938CCCF9A043B9CE/i);
  assert.match(bootstrap,/Remove-Item -LiteralPath \$installer -Force/);
  assert.match(bootstrap,/Get-AuthenticodeSignature/);
  assert.match(bootstrap,/Exafunction, Inc\./);
  assert.match(bootstrap,/Optional Devin CLI setup was skipped; OmniRoute setup will continue/);
  assert.doesNotMatch(bootstrap,/Invoke-Expression|\|\s*iex|curl.*\|/i);
  const setup=await readFile(new URL('./dual/Setup.ps1',import.meta.url),'utf8');
  assert.match(setup,/OmniRoute Devin CLI/);
  assert.match(setup,/'devin'/);
  const launch=await readFile(new URL('./dual/Launch.ps1',import.meta.url),'utf8');
  assert.match(launch,/ValidateSet\([^)]*'devin'/);
  assert.doesNotMatch(launch,/fusion|astra|sol|terra|--model/i);
});
test('consumer browser launchers are not exposed in installed wrappers',async()=>{
  const ps=await readFile(new URL('./dual/Launch.ps1',import.meta.url),'utf8');
  const sh=await readFile(new URL('./dual/Launch.sh',import.meta.url),'utf8');
  assert.doesNotMatch(ps,/browser-consumers|shared-session\.mjs/);
  assert.doesNotMatch(sh,/browser-consumers|shared-session\.mjs/);
});
test('Windows and Linux launchers forward harness commands to the bundled OmniRoute CLI',async()=>{
  const ps=await readFile(new URL('./dual/Launch.ps1',import.meta.url),'utf8');
  const sh=await readFile(new URL('./dual/Launch.sh',import.meta.url),'utf8');
  assert.match(ps,/ValidateSet\([^)]*'harness'/);
  assert.match(ps,/\$Action -eq 'harness'[\s\S]*?app\/apps\/cli\/dist\/bin\.js[\s\S]*?\$Extra/);
  assert.match(sh,/if\s*\[\s*"\$action"\s*=\s*harness\s*\][\s\S]*?app\/apps\/cli\/dist\/bin\.js[\s\S]*?\bharness "\$@"/);
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

test('one-click setup never opens or autostarts consumer browsers',async()=>{
  const source=await readFile(new URL('./dual-setup.mjs',import.meta.url),'utf8');
  const setup=source.slice(source.indexOf('export async function setupBoth'));
  for(const call of ['configureClaudeConsumer','configureZaiConsumer','configurePrivateBrowserConsumers','installSharedBrowserConsumerAutostart','launchSharedBrowserConsumerSetup']) assert.doesNotMatch(setup,new RegExp(`await ${call}\\(`),call);
  assert.match(setup,/disableBrowserConsumers/);
  assert.doesNotMatch(setup,/Opening one shared browser|six consumer sign-in tabs/);
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
