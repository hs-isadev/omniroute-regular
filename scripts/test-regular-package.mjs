import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, access, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const linux=process.platform==='linux',name='OmniRoute-Regular-'+version+'-'+(linux?'linux':'windows')+'-x64';
await mkdir(join(root,'test-artifacts'),{recursive:true});
const temp=await mkdtemp(join(root,'test-artifacts','antigravity-'));
async function run(command,args,options={}) {
  return new Promise((res,rej)=>{
    const child=spawn(command,args,{cwd:temp,windowsHide:true,shell:false,...options});let output='',errors='';
    child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',b=>errors+=b);
    const timer=setTimeout(()=>{child.kill();rej(Error('Package smoke timed out'));},120000);
    child.once('error',e=>{clearTimeout(timer);rej(e);});
    child.once('exit',code=>{clearTimeout(timer);code===0?res(output):rej(Error('Smoke process failed: '+errors+'\n'+output));});
  });
}
const archive=join(root,'release',name+(linux?'.tar.gz':'.zip'));
assert.equal(createHash('sha256').update(await readFile(archive)).digest('hex'),(await readFile(archive+'.sha256','utf8')).split(' ')[0]);
const extracted=join(temp,'extracted');await mkdir(extracted);
await run(linux?'tar':'tar.exe',['-xf',archive,'-C',extracted]);
const bundle=join(extracted,name),install=join(temp,'Install With Spaces');
if(linux) {
  await run('sh',[join(bundle,'Setup.sh'),'--install-root',install,'--no-wizard']);
  await run('sh',[join(bundle,'Setup.sh'),'--install-root',install,'--no-wizard']);
  assert.equal((await stat(install)).mode&0o777,0o700);
  for(const name of ['Setup.sh','payload/Launch.sh','payload/Settings.sh','payload/Manage.sh','payload/Connect.sh']) await run('sh',['-n',join(bundle,name)]);
} else {
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',join(bundle,'Setup.ps1'),'-InstallRoot',install,'-NoWizard','-NoShortcuts'];
  await run('powershell.exe',args);await run('powershell.exe',args);
  await run('powershell.exe',['-NoProfile','-File',join(install,'Settings.ps1'),'-SmokeTest']);
}
const active=(await readFile(join(install,'active-version.txt'),'utf8')).trim();assert.match(active,/^versions\/[a-zA-Z0-9.-]+$/);
const payload=join(install,active),node=join(payload,linux?'node/node':'node/node.exe'),app=join(payload,'app');
await access(join(install,linux?'Connect.sh':'Connect.cmd'));
await access(join(app,'distribution/guided-setup.mjs'));
const url=p=>pathToFileURL(join(app,p)).href;
assert.match(await run(node,['--version']),/v22\.23\.2/);await assert.rejects(access(join(payload,'opencode')),/ENOENT/);
const workspace=join(temp,'Project With Spaces');await mkdir(workspace);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|TOKEN|SECRET|PASSWORD|NODE_OPTIONS|OMNIROUTE|OPENCODE/i.test(key)));
env.OMNIROUTE_REGULAR_ROOT=install;env.OMNIROUTE_HOME=join(install,'data');
const preview=await run(node,[join(app,'distribution/launch.mjs'),'--workspace',workspace,'--host',node,'--dry-run'],{env});assert.match(preview,/Preview only/);
await assert.rejects(access(join(workspace,'.agents/mcp_config.json')),/ENOENT/);
await run(node,['--input-type=module','-e',`
import {configure} from ${JSON.stringify(url('distribution/settings.mjs'))};
import {getRuntimePaths} from ${JSON.stringify(url('packages/config/dist/index.js'))};
import {InMemoryKeyProtector} from ${JSON.stringify(url('packages/vault/dist/index.js'))};
await configure({keys:{GROQ_API_KEY:'fixture-package-only-not-real'},freeOnlyConfirmed:true},getRuntimePaths(),{protector:new InMemoryKeyProtector(Buffer.alloc(32,7)),factory:()=>({generate:async()=>({text:'OK'})})});
`],{env});
const rawVault=await readFile(join(install,'data/vault/vault.json'),'utf8');assert.ok(!rawVault.includes('fixture-package-only-not-real'));
const config=JSON.parse(await readFile(join(install,'data/config.json'),'utf8'));assert.deepEqual(config.providers.filter(p=>p.enabled).map(p=>p.id),['groq']);

// Genuine stdio + production router, FAKE provider. Not an Antigravity host test.
async function protocol() {
  const child=spawn(node,[join(root,'scripts/package-protocol-fixture.mjs'),app,temp],{cwd:workspace,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pending=new Map();let buffer='',stderr='',id=0;
  child.stderr.on('data',b=>stderr+=b);
  child.stdout.on('data',b=>{
    buffer+=b;
    while(buffer.includes('\n')) {
      const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1);
      try {const m=JSON.parse(line),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
      catch(error){for(const p of pending.values())p.reject(error);}
    }
  });
  const exit=new Promise((res,rej)=>{child.once('error',rej);child.once('exit',res);});
  const call=(method,params)=>new Promise((resolve,reject)=>{
    const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('MCP timed out: '+stderr));},15000);
    pending.set(requestId,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');
  });
  try {
    const init=await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'package-protocol-fixture',version:'1'}});assert.equal(init.serverInfo.name,'omniroute');
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const listing=await call('tools/list',{});assert.deepEqual(listing.tools.map(t=>t.name).sort(),['omni_models','omni_route','omni_routes']);
    const schema=listing.tools.find(t=>t.name==='omni_route').inputSchema.properties.routingMode;
    assert.ok(JSON.stringify(schema).includes('regular'));assert.ok(!JSON.stringify(schema).includes('orchestrator'));
    const easy=await call('tools/call',{name:'omni_route',arguments:{prompt:'What is a variable?',routingMode:'regular'}});
    assert.equal(easy.isError,undefined);assert.equal(easy.structuredContent.attribution.worker.modelId,'openai/gpt-oss-20b');
    const code=await call('tools/call',{name:'omni_route',arguments:{prompt:'Write a Python function to add two numbers.',requiredCapabilities:['coding'],routingMode:'regular'}});
    assert.equal(code.structuredContent.attribution.worker.modelId,'openai/gpt-oss-120b');assert.match(code.structuredContent.badge,/groq/);
    const recent=await call('tools/call',{name:'omni_routes',arguments:{limit:2}});assert.equal(recent.structuredContent.routes.length>=2,true);
    const bad=await call('tools/call',{name:'omni_route',arguments:{prompt:'continue',routingMode:'regular'}});assert.equal(bad.isError,true);
    child.stdin.end();let timer;
    const result=await Promise.race([exit,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('MCP did not exit on EOF')),5000))]);clearTimeout(timer);assert.equal(result,0);
    return {easy:easy.structuredContent.routeId,coding:code.structuredContent.routeId};
  }finally{if(child.exitCode===null)child.kill();for(const p of pending.values())clearTimeout(p.timer);}
}
const routes=await protocol();await protocol();
assert.ok(!(await readFile(join(temp,'diagnostic.jsonl'),'utf8')).includes('Write a Python function'));
await run(node,['--input-type=module','-e',`
import {integrateWorkspace,removeWorkspaceIntegration} from ${JSON.stringify(url('distribution/antigravity.mjs'))};
import {uninstallPackage} from ${JSON.stringify(url('distribution/install.mjs'))};
const options={workspace:${JSON.stringify(workspace)},node:process.execPath,entrypoint:${JSON.stringify(join(app,'distribution/mcp-regular.mjs'))},runtimeRoot:${JSON.stringify(join(install,'data'))},apply:true};
await integrateWorkspace(options);await removeWorkspaceIntegration(options);await uninstallPackage(${JSON.stringify(install)});
`],{env});
assert.equal(await readFile(join(install,'data/vault/vault.json'),'utf8'),rawVault);
console.log(JSON.stringify({status:'PASS',platform:process.platform,extractedArchive:archive,temp,checks:['checksum','no OpenCode dependency','install/reinstall with spaces','masked Windows form or Linux shell syntax','Groq-only fixture setup','MCP discovery/invocation','light/strong routing','MCP EOF/reconnect','redacted logs','workspace merge/detach','data-preserving uninstall'],fixtureRouteIds:routes,realAntigravityHostTest:false,realProviderTest:false,realLinuxKeyringTest:false},null,2));
