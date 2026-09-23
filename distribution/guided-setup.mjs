import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { getRuntimePaths } from '../packages/config/dist/index.js';
import { defaultHostPaths, IntegrationManager } from '../packages/integrations/dist/index.js';
import { findAntigravity } from './antigravity.mjs';

// Only workspace/confirmation text is read here. Credentials belong exclusively
// to the child Settings UI/hidden TTY, never to arguments, files or this prompt.
export function runStep(command,args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',shell:false,windowsHide:true});
    child.once('error',()=>reject(new Error('Could not start a setup step. Check the installation and prerequisites.')));
    child.once('exit',code=>resolve(code??1));
  });
}
async function question(label) {
  const input=createInterface({input:process.stdin,output:process.stdout});
  try {return await input.question(label);} finally {input.close();}
}
async function existing(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
}
function inside(directory, path) {
  const child = relative(resolve(directory), resolve(path));
  return child === '' || (child !== '..' && !child.startsWith(`..${path.includes('\\') ? '\\' : '/'}`) && !isAbsolute(child));
}
async function findTrustedExecutable(name, { platform=process.platform, env=process.env, cwd=process.cwd() }={}) {
  const extensions = platform === 'win32' ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  const pathValue = env.PATH ?? env.Path ?? '';
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    if (!isAbsolute(directory) || inside(cwd, directory)) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension.toLowerCase()}`);
      try {
        if (!(await lstat(candidate)).isFile()) continue;
        await access(candidate);
        return await realpath(candidate);
      } catch (error) { if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error; }
    }
  }
  return null;
}
export async function detectInstalledHosts({ home=homedir(), platform=process.platform, env=process.env, cwd=process.cwd() }={}) {
  if (!isAbsolute(home)) throw new Error('Host detection requires an absolute home path.');
  const antigravity = await findAntigravity({ platform, env, searchPath: true });
  const codexConfig = join(home, '.codex', 'config.toml');
  const codexDir = join(home, '.codex');
  const openCodeConfigCandidates = [
    join(home, '.config', 'opencode', 'opencode.json'),
    env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME) ? join(env.XDG_CONFIG_HOME, 'opencode', 'opencode.json') : null,
    env.APPDATA && isAbsolute(env.APPDATA) ? join(env.APPDATA, 'opencode', 'opencode.json') : null,
  ].filter(Boolean);
  const openCodeDirCandidates = openCodeConfigCandidates.map(path => path.slice(0, -'opencode.json'.length));
  const [codexConfigPresent, codexDirPresent, openCodeConfigStates, openCodeDirStates, codexExecutable, openCodeExecutable] = await Promise.all([
    existing(codexConfig), existing(codexDir), Promise.all(openCodeConfigCandidates.map(existing)), Promise.all(openCodeDirCandidates.map(existing)),
    findTrustedExecutable('codex', { platform, env, cwd }), findTrustedExecutable('opencode', { platform, env, cwd }),
  ]);
  const openCodeConfigIndex = openCodeConfigStates.findIndex(Boolean);
  return {
    antigravity: { installed: !!antigravity, executable: antigravity?.executable ?? null, kind: antigravity?.kind ?? null },
    codex: { installed: codexConfigPresent || codexDirPresent || !!codexExecutable, executable: codexExecutable, configPath: codexConfigPresent ? codexConfig : null },
    opencode: { installed: openCodeConfigIndex >= 0 || openCodeDirStates.some(Boolean) || !!openCodeExecutable, executable: openCodeExecutable, configPath: openCodeConfigIndex >= 0 ? openCodeConfigCandidates[openCodeConfigIndex] : null },
  };
}
export async function integrateDetectedHosts({ root, node=process.execPath, home=homedir(), platform=process.platform, env=process.env, detected, tell=console.log }={}) {
  if (!root || !isAbsolute(root) || !isAbsolute(home)) throw new Error('Host integration requires absolute installation and home paths.');
  const hosts = detected ?? await detectInstalledHosts({ home, platform, env });
  if (!hosts.codex.installed && !hosts.opencode.installed) return { detected: hosts, integrated: [], skipped: [] };
  if (!isAbsolute(node)) throw new Error('Host integration requires an absolute Node path.');
  const cliPath = fileURLToPath(new URL('../apps/cli/dist/bin.js', import.meta.url));
  const hostPaths = defaultHostPaths(home);
  if (hosts.opencode.configPath && resolve(hosts.opencode.configPath) !== resolve(hostPaths.openCodeConfig)) {
    const openCodeRoot = resolve(hosts.opencode.configPath, '..');
    hostPaths.openCodeConfig = hosts.opencode.configPath;
    hostPaths.openCodeInstructions = join(openCodeRoot, 'omniroute-regular.md');
    hostPaths.openCodeSkillsDir = join(openCodeRoot, 'skills');
  }
  const manager = new IntegrationManager({ hostPaths, runtimePaths: getRuntimePaths(join(root, 'data')), nodePath: node, cliPath });
  const integrated = [], skipped = [];
  for (const target of ['codex', 'opencode']) {
    if (!hosts[target].installed) continue;
    try {
      const plan = await manager.plan(target, 'install');
      if (plan.changed) await manager.apply(plan);
      integrated.push({ target, changed: plan.changed });
    } catch (error) {
      skipped.push({ target, reason: error.message });
      tell(`${target} was detected but left unchanged: ${error.message}`);
    }
  }
  return { detected: hosts, integrated, skipped };
}
export async function runGuidedSetup({root,platform=process.platform,node=process.execPath,
  home=homedir(),env=process.env,interactive=!!process.stdin.isTTY,ask=question,tell=console.log,run=runStep,keyEntry='editor',browserConsumers=true}={}) {
  if(!root||!isAbsolute(root)) throw new Error('Use an absolute installation root. Run the installed Connect script.');
  if(!['win32','linux'].includes(platform)) throw new Error('Windows or Linux is required.');
  if(!interactive) throw new Error('Guided setup requires an interactive terminal. Use Setup -NoWizard / --no-wizard for install only.');
  const active=(await readFile(join(root,'active-version.txt'),'utf8')).trim();
  if(!/^versions\/[a-zA-Z0-9.-]+$/.test(active)) throw new Error('Invalid active version.');
  const launch=join(root,active,'app/distribution/launch.mjs');
  const detectedHosts=await detectInstalledHosts({home, platform, env});
  tell(`Detected hosts: Antigravity=${detectedHosts.antigravity.installed?'yes':'no'}, OpenCode=${detectedHosts.opencode.installed?'yes':'no'}, Codex=${detectedHosts.codex.installed?'yes':'no'}.`);
  tell('Step 2/4: Enter keys locally. One suitable free provider is enough; blank fields keep saved keys.');
  tell('Sign in to Antigravity itself separately. Never enter account passwords or cookies here.');
  const settings=keyEntry!=='masked' ? [node,[join(root,active,'app/distribution/key-editor.mjs')]] : platform==='win32'
    ? ['powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'Settings.ps1'),'-InstallRoot',root,'-RequireReady']]
    : ['sh',[join(root,'Settings.sh')]];
  if(await run(...settings)!==0) throw new Error('Key setup cancelled or failed. No workspace was connected. Run Connect to resume.');
  if(browserConsumers){
    const browserSetup=join(root,active,'app/distribution/browser-consumer-setup.mjs');
    tell('Step 3/5: Opening one shared browser with six consumer sign-in tabs. Sign in only to accounts you choose; no passwords or cookies are read by OmniRoute.');
    if(await run(node,[browserSetup,'launch','--root',root])!==0) throw new Error('Browser sign-in window could not start. Install a supported Chromium-family browser, then run Connect again.');
    if(await run(node,[browserSetup,'enable','--root',root])!==0) throw new Error('Browser consumer setup failed. No browser credentials were stored. Run Connect to retry.');
    tell('Browser consumers are enabled as ordinary local OmniRoute providers, and the visible browser session is installed to open at every desktop login. Sign in only to the tabs you intend to use.');
  }
  tell(browserConsumers?'Step 4/5: Choose an existing project, or press Enter to create/use a starter workspace.':'Step 3/4: Choose an existing project, or press Enter to create/use a starter workspace.');
  const selected=(await ask('Project folder (Enter = starter workspace): ')).trim();
  let workspace;
  if(selected) {
    if(!isAbsolute(selected)||/[\r\n\0]/.test(selected)) throw new Error('Choose an absolute existing project directory, without surrounding quotes.');
    workspace=resolve(selected);
    if(!(await stat(workspace).catch(()=>null))?.isDirectory()) throw new Error('Choose an existing project directory.');
  } else {
    workspace=join(root,'workspace');await mkdir(workspace,{recursive:true,mode:0o700});
  }
  tell(browserConsumers?'Step 5/5: Preview workspace MCP/rules. Nothing is applied until you confirm.':'Step 4/4: Preview workspace MCP/rules. Nothing is applied until you confirm.');
  if(await run(node,[launch,'--workspace',workspace,'--dry-run'])!==0) throw new Error('Workspace preview failed. Install/sign in to official Antigravity or fix the reported conflict, then run Connect again.');
  if((await ask('Connect this workspace and open Antigravity? Type yes: ')).trim().toLowerCase()!=='yes') {
    tell('Stopped after preview. Keys were retained; no workspace integration was applied.');
    return {status:'cancelled',workspace};
  }
  tell('In Antigravity, first ask: Call omni_models and show enabled workers.');
  tell('Then ask: Use omni_route with routingMode="regular" to explain a variable in one sentence; show its badge and route ID.');
  tell('Call omni_routes to verify the actual route. Host quota still applies; setup does not prove automatic tool adherence.');
  if(await run(node,[launch,'--workspace',workspace,'--apply'])!==0) throw new Error('Antigravity launch failed or exited with an error. The workspace may already be connected; inspect the output before retrying.');
  const developerHosts=await integrateDetectedHosts({root,node,home,platform,env,detected:detectedHosts,tell});
  if(developerHosts.integrated.length) tell(`Managed skills/MCP integration applied to: ${developerHosts.integrated.map(item=>item.target).join(', ')}.`);
  return {status:'launched',workspace,detectedHosts,developerHosts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await runGuidedSetup({root:process.env.OMNIROUTE_REGULAR_ROOT,keyEntry:process.argv.includes('--masked')?'masked':'editor'});}
  catch(error) {console.error(error.message);process.exitCode=1;}
}
