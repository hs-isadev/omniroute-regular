import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const name=`OmniRoute-Regular-${version}-windows-x64`;
await mkdir(join(root,'test-artifacts'),{recursive:true});
const temp=await mkdtemp(join(root,'test-artifacts','clean-'));
const extracted=join(temp,'extracted');await mkdir(extracted);
const ps=s=>"'"+s.replaceAll("'","''")+"'";
function run(command,args,options={}) {
  return new Promise((res,rej)=>{
    const child=spawn(command,args,{cwd:temp,windowsHide:true,...options});let output='',error='';
    child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',b=>error+=b);
    const timer=setTimeout(()=>{child.kill();rej(new Error('Smoke test timed out'));},120000);
    child.on('error',e=>{clearTimeout(timer);rej(e);});
    child.on('exit',code=>{clearTimeout(timer);code===0?res(output):rej(new Error(`${command} failed: ${error}\n${output}`));});
  });
}
const zip=join(root,'release',name+'.zip');
assert.equal(createHash('sha256').update(await readFile(zip)).digest('hex'),(await readFile(zip+'.sha256','utf8')).split(' ')[0]);
if(!process.argv.includes('--folder')) await run('tar.exe',['-xf',zip,'-C',extracted]);
const bundle=process.argv.includes('--folder')?join(root,'release',name):join(extracted,name),install=join(temp,'Install With Spaces');
await run('powershell.exe',['-NoProfile','-Command',`$ErrorActionPreference='Stop'; foreach($file in @(${ps(join(bundle,'Setup.ps1'))},${ps(join(bundle,'payload/Settings.ps1'))})) { $tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors); if($errors.Count) { throw ($errors | Out-String) } }; Add-Type -AssemblyName System.Windows.Forms`]);
await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(bundle,'Setup.ps1'),'-InstallRoot',install,'-NoWizard','-NoShortcuts']);
await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(install,'Settings.ps1'),'-InstallRoot',install,'-SmokeTest']);
// Rerun is safe and doesn't overwrite binaries/data.
await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(bundle,'Setup.ps1'),'-InstallRoot',install,'-NoWizard','-NoShortcuts']);
const node=join(install,'node/node.exe'), app=join(install,'app');
assert.match(await run(node,['--version']),/v22\.23\.2/);
const env={...process.env,OMNIROUTE_HOME:join(install,'data')};
for(const key of Object.keys(env)) if(/API_KEY|API_TOKEN|^HF_TOKEN$|^OPENCODE_|^ANTHROPIC_|^OPENAI_/.test(key)) delete env[key];
for(const kind of ['CONFIG','DATA','STATE','CACHE']) env[`XDG_${kind}_HOME`]=join(install,'profile',kind.toLowerCase());
env.OPENCODE_DISABLE_PROJECT_CONFIG='true';
assert.match(await run(join(install,'opencode/opencode.exe'),['--version'],{env}),/1\.18\.25/);
const url=path=>pathToFileURL(join(app,path)).href;
await run(node,['--input-type=module','-e',`
  import {configure} from ${JSON.stringify(url('distribution/settings.mjs'))};
  import {getRuntimePaths} from ${JSON.stringify(url('packages/config/dist/index.js'))};
  await configure({keys:{OPENROUTER_API_KEY:'fixture-portable-smoke-not-a-real-key'},freeOnlyConfirmed:true},getRuntimePaths(),{factory:()=>({generate:async()=>({text:'OK'})})});
`],{env});
assert.ok(!(await readFile(join(install,'data/vault/vault.json'),'utf8')).includes('fixture-portable-smoke-not-a-real-key'));
// Inspect the real OpenCode config without making an LLM request.
const {openCodeRegularConfig}=await import(url('apps/cli/dist/harness-env.js'));
const inline=JSON.parse(openCodeRegularConfig(node,join(app,'apps/cli/dist/bin.js'),env.OMNIROUTE_HOME,join(app,'docs/integrations/opencode-regular-instructions.md'),'http://127.0.0.1:1'));
inline.share='disabled';inline.autoupdate=false;inline.skills={paths:[join(app,'distribution/skills')]};inline.permission={task:'deny'};
env.OPENROUTER_API_KEY='fixture-session-token';env.OPENCODE_CONFIG_CONTENT=JSON.stringify(inline);
const debug=JSON.parse(await run(join(install,'opencode/opencode.exe'),['--pure','debug','config'],{env}));
assert.equal(debug.model,'openrouter/openrouter/free'); assert.deepEqual(debug.enabled_providers,['openrouter']);
assert.deepEqual(Object.keys(debug.mcp),['omniroute']);assert.equal(debug.permission.task,'deny');
const mcp=await run(join(install,'opencode/opencode.exe'),['--pure','mcp','list'],{env});
assert.match(mcp,/omniroute/); assert.match(mcp,/connected/);
// Start/stop the bundled daemon, with the isolated synthetic-key vault. Health
// does not invoke catalog discovery or inference.
const daemon=spawn(node,[join(app,'apps/daemon/dist/main.js')],{cwd:app,env,windowsHide:true,stdio:'pipe'});
let daemonError='';daemon.stderr.on('data',b=>daemonError+=b);
try {
  let health;
  for(let i=0;i<40;i++) {
    if(daemon.exitCode!==null) throw new Error(`Daemon exited: ${daemonError}`);
    try {health=await (await fetch('http://127.0.0.1:47839/v1/health',{signal:AbortSignal.timeout(300)})).json();break;}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  assert.equal(health?.defaultMode,'regular');assert.equal(health.freeOnly,true);
} finally {daemon.kill();}
console.log(`PASS: ${process.argv.includes('--folder')?'staging-folder':'extracted-ZIP'} clean install with spaces, rerun, PS5 parsing, masked Forms controls, portable versions, DPAPI key setup, isolated real OpenCode configuration, MCP connection, daemon health. No real API keys or LLM requests used.`);
console.log(`Synthetic test profile retained at ${temp}`);
