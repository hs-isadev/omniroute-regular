import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { getRuntimePaths, loadConfig } from '../packages/config/dist/index.js';
import { SecretVault } from '../packages/vault/dist/index.js';
import { DaemonClient } from '../apps/cli/dist/client.js';
import { openCodeRegularConfig, openCodeHarnessEnvironment } from '../apps/cli/dist/harness-env.js';
import { startHostModelProxy } from '../apps/cli/dist/host-model-proxy.js';
const app = fileURLToPath(new URL('../', import.meta.url));
const install = resolve(app, '..');
process.env.OMNIROUTE_HOME = join(install,'data');
const paths = getRuntimePaths();
let daemon, proxy, child;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{child?.kill(); daemon?.kill();});
try {
  const config = await loadConfig(paths);
  if (!config.routing.freeOnly || config.routing.defaultMode !== 'regular' || config.daemon.port !== 47839) throw new Error('Run Settings to restore regular-mode configuration.');
  const vault = await SecretVault.load(paths.vault);
  let key; try { key = vault.get('openrouter')?.OPENROUTER_API_KEY; } finally { vault.dispose(); }
  if (!key) throw new Error('Run Settings and enter your OpenRouter key first.');
  const client = new DaemonClient(paths);
  try { await client.request('/v1/config', {signal:AbortSignal.timeout(700)}); throw new Error('OmniRoute Regular is already running. Close its other window first.'); }
  catch (error) { if (error.message.includes('already running')) throw error; }
  daemon = spawn(process.execPath,[join(app,'apps/daemon/dist/main.js')],{cwd:app,env:{...process.env,OMNIROUTE_HOME:paths.root},windowsHide:true,stdio:'ignore'});
  let exited = false; daemon.on('exit',()=>{exited=true;}); daemon.on('error',()=>{exited=true;});
  let ready=false;
  for(let i=0;i<40;i++) {
    if(exited) throw new Error('Router could not start. Port 47839 may already be in use.');
    try { await client.request('/v1/config',{signal:AbortSignal.timeout(500)}); ready=true; break; } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready) throw new Error('Router startup timed out. See data/logs.');
  proxy = await startHostModelProxy(key);
  const inline = JSON.parse(openCodeRegularConfig(process.execPath,join(app,'apps/cli/dist/bin.js'),paths.root,join(app,'docs/integrations/opencode-regular-instructions.md'),proxy.baseURL));
  inline.share='disabled'; inline.autoupdate=false;
  inline.skills={paths:[join(app,'distribution/skills')]};
  inline.permission={task:'deny'};
  const workspace=join(install,'workspace'); await mkdir(workspace,{recursive:true});
  const environment=openCodeHarnessEnvironment(process.env,paths.root,proxy.token,JSON.stringify(inline));
  // Keep OpenCode config, auth and history separate from other installations.
  for(const kind of ['CONFIG','DATA','STATE','CACHE']) environment[`XDG_${kind}_HOME`]=join(install,'opencode-user',kind.toLowerCase());
  environment.OPENCODE_DISABLE_PROJECT_CONFIG='true';
  child=spawn(join(install,'opencode/opencode.exe'),['--pure','--model','openrouter/openrouter/free'],{cwd:workspace,env:environment,stdio:'inherit',shell:false});
  process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
} catch(error) { console.error(error.message); process.exitCode=1; }
finally { if(proxy) await proxy.close(); if(daemon && daemon.exitCode===null) daemon.kill(); }
