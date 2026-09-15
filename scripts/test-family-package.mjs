import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {access,readFile,writeFile,mkdtemp,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyPackage} from '../distribution/install.mjs';

const repo=resolve(import.meta.dirname,'..'),name='OmniRoute-Private-0.6.6-private.1';
const archive=resolve(process.argv[2]??join(repo,'release',name+'.zip'));
const temp=await mkdtemp(join(repo,'test-artifacts/family-smoke-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(await readFile(archive)),(await readFile(archive+'.sha256','utf8')).split(' ')[0]);
async function run(command,args,options={}) {
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{windowsHide:true,cwd:temp,...options});let output='';
    child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',b=>output+=b);
    const timer=setTimeout(()=>{child.kill();reject(Error('Smoke timeout'));},120000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);code===0?resolvePromise(output):reject(Error('Smoke failed: '+output));});
  });
}
await run(process.platform==='win32'?'tar.exe':'tar',['-xf',archive,'-C',temp]);
const family=join(temp,name);
for(const [label,platform] of [['Windows','windows-x64'],['Linux','linux-x64']]) await verifyPackage(join(family,label),platform);

let scanned=0;
async function inspect(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name),rel=relative(family,path).replaceAll('\\','/');
    assert.equal(entry.isSymbolicLink(),false);
    if(entry.isDirectory()){await inspect(path);continue;}
    scanned++;
    assert.doesNotMatch(rel,/(?:^|\/)(?:\.git|\.env|vault\.json|credentials\.txt|auth\.json|test-artifacts|plans)(?:$|[\/.])/i);
    assert.doesNotMatch(rel,/(?:^|\/)(?:cookies|Login Data)(?:$|-(?:journal|wal|shm)$|\.(?:db|sqlite)$)/i);
    const owned=/\/app\/(?:packages|apps|distribution|node_modules\/@omniroute)\//.test(rel);
    if(owned) assert.doesNotMatch(rel,/\/src\/|\.(?:ts|map)$|\.tsbuildinfo$|\.(?:test|spec)\.[cm]?js$/);
    if(owned && /\.(?:js|mjs|json|ps1|py|sh)$/.test(rel) && (await stat(path)).size<2_000_000) {
      const content=await readFile(path,'utf8');
      assert.doesNotMatch(content,/C:\\\\Users\\\\thest|C:\\Users\\thest|\b(?:gsk_[A-Za-z0-9]{30,}|sk-proj-[A-Za-z0-9_-]{30,}|ghp_[A-Za-z0-9]{30,})\b/);
    }
  }
}
await inspect(family);
const platform=process.platform==='win32'?'Windows':'Linux',bundle=join(family,platform),install=join(temp,'Install With Spaces');
const previousBundle=join(repo,'release','OmniRoute-Private-0.6.5-private.1',platform);
await verifyPackage(previousBundle,process.platform==='win32'?'windows-x64':'linux-x64');
if(process.platform==='win32'){
  await run('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',join(previousBundle,'Setup.ps1'),'-InstallRoot',install,'-InstallOnly']);
  await run('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',join(bundle,'Setup.ps1'),'-InstallRoot',install,'-InstallOnly']);
}else{
  await run(join(previousBundle,'payload/node/node'),[join(previousBundle,'payload/app/distribution/install.mjs'),'install',previousBundle,install]);
  await run(join(bundle,'payload/node/node'),[join(bundle,'payload/app/distribution/install.mjs'),'install',bundle,install]);
}
const previousActive=JSON.parse(await readFile(join(install,'installed.json'),'utf8')).previous;
const active=(await readFile(join(install,'active-version.txt'),'utf8')).trim();
const app=join(install,active,'app'),node=join(install,active,'node',process.platform==='win32'?'node.exe':'node');
const moduleAt=path=>import(pathToFileURL(join(app,path)).href);
const {DEFAULT_CONFIG}=await moduleAt('packages/config/dist/index.js');
const packagedVault=await moduleAt('packages/vault/dist/index.js');
assert.equal(typeof packagedVault.SecretVault.prototype.getCredentialSlots,'function');
assert.equal(packagedVault.MAX_CREDENTIAL_SLOTS,5);
const {assertRegularProviderPolicy}=await moduleAt('distribution/regular-policy.mjs');
const config=structuredClone(DEFAULT_CONFIG);for(const p of config.providers)p.enabled=false;
const qwen=config.providers.find(p=>p.id==='qwen-consumer'),adapter=join(app,'packages/browser-consumer-adapter/runtime/adapter.mjs');
Object.assign(qwen,{enabled:true,freeTierConfirmed:true,mcpCommand:node,mcpArgs:[adapter,'--provider','qwen','--endpoint',qwen.baseUrl],mcpWorkingDirectory:dirname(adapter)});
assertRegularProviderPolicy(config);

let registeredHandshakes=0;
if(process.platform==='win32'){
  const settingsSmoke=await run('powershell.exe',['-NoLogo','-NoProfile','-STA','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(app,'distribution/Settings.ps1'),'-InstallRoot',install,'-AppRoot',app,'-NodePath',node,'-RuntimeRoot',join(install,'data'),'-Simple','-SmokeTest']);
  assert.match(settingsSmoke,/65 masked/);
  const hostHome=join(temp,'Antigravity Home With Spaces');await mkdir(hostHome,{recursive:true});
  const runtimePaths=(await moduleAt('packages/config/dist/index.js')).getRuntimePaths(join(install,'data'));
  const runtimeConfig=(await moduleAt('distribution/settings.mjs')).regularConfig();for(const provider of runtimeConfig.providers)provider.enabled=false;
  await (await moduleAt('packages/config/dist/index.js')).saveConfig(runtimeConfig,runtimePaths);
  const runtimeVault=await (await moduleAt('packages/vault/dist/index.js')).SecretVault.load(runtimePaths.vault);try{await runtimeVault.save(runtimePaths.vault);}finally{runtimeVault.dispose();}
  const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|TOKEN|SECRET|PASSWORD|NODE_OPTIONS|OMNIROUTE|OPENCODE/i.test(key)));
  Object.assign(cleanEnv,{HOME:hostHome,USERPROFILE:hostHome,APPDATA:join(hostHome,'AppData/Roaming'),OMNIROUTE_REGULAR_ROOT:install,OMNIROUTE_HOME:join(install,'data')});
  const hostConfig=join(hostHome,'.gemini/config/mcp_config.json');
  const startup=join(cleanEnv.APPDATA,'Microsoft/Windows/Start Menu/Programs/Startup/OmniRoute Browser Consumers.vbs');await mkdir(dirname(startup),{recursive:true});
  await writeFile(startup,`CreateObject("WScript.Shell").Run """${join(install,previousActive,'node/node.exe')}"" ""${join(install,previousActive,'app/packages/browser-consumer-adapter/runtime/shared-session.mjs')}"" --background --profile ""${join(install,'data/browser-consumer-profile')}"" --port 47842", 0, False\r\n`);
  const repair=async()=>{await (await import(pathToFileURL(join(install,(await readFile(join(install,'active-version.txt'),'utf8')).trim(),'app/distribution/dual-setup.mjs')).href)).repairHostRegistrations({root:install,home:hostHome,env:cleanEnv});};
  const assertStartup=async expectedActive=>{const text=await readFile(startup,'utf8'),expectedNode=join(install,expectedActive,'node/node.exe'),expectedEntry=join(install,expectedActive,'app/packages/browser-consumer-adapter/runtime/shared-session.mjs');assert.match(text,new RegExp(expectedNode.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&')));assert.match(text,new RegExp(expectedEntry.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&')));await access(expectedNode);await access(expectedEntry);};
  const handshake=async expectedActive=>{
    const entry=JSON.parse(await readFile(hostConfig,'utf8')).mcpServers.omniroute_regular;
    assert.equal(entry.command,join(install,expectedActive,'node/node.exe'));assert.deepEqual(entry.args,[join(install,expectedActive,'app/distribution/mcp-regular.mjs')]);
    const server=spawn(entry.command,entry.args,{windowsHide:true,env:{...cleanEnv,...entry.env},stdio:['pipe','pipe','pipe']});
    const requests=new Map();let input='',requestId=0;
    server.stderr.on('data',()=>{});server.stdout.on('data',bytes=>{input+=bytes;while(input.includes('\n')){const at=input.indexOf('\n'),line=input.slice(0,at);input=input.slice(at+1);if(!line)continue;const response=JSON.parse(line),pending=requests.get(response.id);if(pending){requests.delete(response.id);clearTimeout(pending.timer);response.error?pending.reject(Error('Registered MCP protocol error')):pending.resolve(response.result);}}});
    const invoke=(method,params)=>new Promise((resolvePromise,reject)=>{const id=++requestId,timer=setTimeout(()=>{requests.delete(id);reject(Error('Registered MCP timeout'));},30000);requests.set(id,{resolve:resolvePromise,reject,timer});server.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
    try{const initialized=await invoke('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'antigravity-registration-smoke',version:'1'}});assert.equal(initialized.serverInfo.name,'omniroute');server.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');const tools=await invoke('tools/list',{});assert.deepEqual(tools.tools.map(tool=>tool.name).sort(),['omni_models','omni_route','omni_routes','omni_usage']);registeredHandshakes++;}
    finally{server.stdin.end();server.kill();for(const pending of requests.values())clearTimeout(pending.timer);}
  };
  await repair();await assertStartup(active);await handshake(active);
  await run('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',join(install,'Manage.ps1'),'-Action','rollback'],{env:cleanEnv});
  assert.equal((await readFile(join(install,'active-version.txt'),'utf8')).trim(),previousActive);await assertStartup(previousActive);await handshake(previousActive);
  await run('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',join(bundle,'Setup.ps1'),'-InstallRoot',install,'-InstallOnly'],{env:cleanEnv});
  await repair();assert.equal((await readFile(join(install,'active-version.txt'),'utf8')).trim(),active);await assertStartup(active);await handshake(active);
}

const child=spawn(node,[join(repo,'scripts/package-protocol-fixture.mjs'),app,temp],{windowsHide:true,stdio:['pipe','pipe','pipe']});
const pending=new Map();let buffer='',id=0;
child.stderr.on('data',()=>{});
child.stdout.on('data',b=>{buffer+=b;while(buffer.includes('\n')){const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1);const msg=JSON.parse(line),p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error('Protocol error')):p.resolve(msg.result);}}});
const call=(method,params)=>new Promise((resolvePromise,reject)=>{const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('MCP timeout'));},15000);pending.set(requestId,{resolve:resolvePromise,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');});
try {
  await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'extracted-family-smoke',version:'1'}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const tools=await call('tools/list',{});assert.deepEqual(tools.tools.map(t=>t.name).sort(),['omni_models','omni_route','omni_routes','omni_usage']);
  const taskPacket={objective:'Explain a closure',excerpts:[],constraints:[],acceptanceCriteria:['One example'],requestedOutput:'One paragraph',independent:true,worthwhile:true,responseTokens:128,instructionReserveTokens:256,synthesisReserveTokens:512};
  const result=await call('tools/call',{name:'omni_route',arguments:{prompt:'Bounded task',routingMode:'regular',taskPacket,selectionPin:{providerId:'groq',modelId:'openai/gpt-oss-20b'}}});
  assert.equal(result.isError,undefined);assert.equal(result.structuredContent.attribution.worker.modelId,'openai/gpt-oss-20b');
  assert.ok(result.structuredContent.attribution.policyDecisions.includes('BOUNDED_DELEGATION_READY'));
  assert.equal(result.structuredContent.attribution.routingDiagnostics[0].reason,'EXPLICIT_PIN');
  const rejected=await call('tools/call',{name:'omni_route',arguments:{prompt:'Bounded task',routingMode:'regular',taskPacket:{...taskPacket,independent:false}}});
  assert.equal(rejected.isError,true);
} finally {child.stdin.end();child.kill();}
const evidence={archive,sha256:hash(await readFile(archive)),filesScanned:scanned,windowsOrLinuxInstall:platform,bothPayloadManifests:'passed',requiredRuntime:'bundled Node and MCP entrypoint verified',updateRollback:'active version and host registration repaired',registeredAntigravityHandshakes:registeredHandshakes,mcpProtocol:'passed with fake provider',browserRegistration:'passed without browser requests',liveInference:false,nativeOtherPlatformSmoke:false,temp};
await writeFile(join(repo,'test-artifacts/family-smoke-result.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
