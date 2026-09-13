import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyPackage} from '../distribution/install.mjs';

const repo=resolve(import.meta.dirname,'..'),name='OmniRoute-Private-0.6.4-private.1';
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
if(process.platform==='win32') await run('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',join(bundle,'Setup.ps1'),'-InstallRoot',install,'-InstallOnly']);
else await run(join(bundle,'payload/node/node'),[join(bundle,'payload/app/distribution/install.mjs'),'install',bundle,install]);
const active=(await readFile(join(install,'active-version.txt'),'utf8')).trim();
const app=join(install,active,'app'),node=join(install,active,'node',process.platform==='win32'?'node.exe':'node');
const moduleAt=path=>import(pathToFileURL(join(app,path)).href);
const {DEFAULT_CONFIG}=await moduleAt('packages/config/dist/index.js');
const {assertRegularProviderPolicy}=await moduleAt('distribution/regular-policy.mjs');
const config=structuredClone(DEFAULT_CONFIG);for(const p of config.providers)p.enabled=false;
const qwen=config.providers.find(p=>p.id==='qwen-consumer'),adapter=join(app,'packages/browser-consumer-adapter/runtime/adapter.mjs');
Object.assign(qwen,{enabled:true,freeTierConfirmed:true,mcpCommand:node,mcpArgs:[adapter,'--provider','qwen','--endpoint',qwen.baseUrl],mcpWorkingDirectory:dirname(adapter)});
assertRegularProviderPolicy(config);

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
const evidence={archive,sha256:hash(await readFile(archive)),filesScanned:scanned,windowsOrLinuxInstall:platform,bothPayloadManifests:'passed',mcpProtocol:'passed with fake provider',browserRegistration:'passed without browser requests',liveInference:false,nativeOtherPlatformSmoke:false,temp};
await writeFile(join(repo,'test-artifacts/family-smoke-result.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
