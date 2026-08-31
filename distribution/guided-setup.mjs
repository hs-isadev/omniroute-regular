import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

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
export async function runGuidedSetup({root,platform=process.platform,node=process.execPath,
  interactive=!!process.stdin.isTTY,ask=question,tell=console.log,run=runStep}={}) {
  if(!root||!isAbsolute(root)) throw new Error('Use an absolute installation root. Run the installed Connect script.');
  if(!['win32','linux'].includes(platform)) throw new Error('Windows or Linux is required.');
  if(!interactive) throw new Error('Guided setup requires an interactive terminal. Use Setup -NoWizard / --no-wizard for install only.');
  const active=(await readFile(join(root,'active-version.txt'),'utf8')).trim();
  if(!/^versions\/[a-zA-Z0-9.-]+$/.test(active)) throw new Error('Invalid active version.');
  const launch=join(root,active,'app/distribution/launch.mjs');
  tell('Step 2/4: Enter keys in Settings. One suitable provider is enough; blank fields keep saved keys.');
  tell('Sign in to Antigravity itself separately. Never enter account passwords or cookies here.');
  const settings=platform==='win32'
    ? ['powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'Settings.ps1'),'-InstallRoot',root,'-RequireReady']]
    : ['sh',[join(root,'Settings.sh')]];
  if(await run(...settings)!==0) throw new Error('Key setup cancelled or failed. No workspace was connected. Run Connect to resume.');
  tell('Step 3/4: Choose an existing project, or press Enter to create/use a starter workspace.');
  const selected=(await ask('Project folder (Enter = starter workspace): ')).trim();
  let workspace;
  if(selected) {
    if(!isAbsolute(selected)||/[\r\n\0]/.test(selected)) throw new Error('Choose an absolute existing project directory, without surrounding quotes.');
    workspace=resolve(selected);
    if(!(await stat(workspace).catch(()=>null))?.isDirectory()) throw new Error('Choose an existing project directory.');
  } else {
    workspace=join(root,'workspace');await mkdir(workspace,{recursive:true,mode:0o700});
  }
  tell('Step 4/4: Preview workspace MCP/rules. Nothing is applied until you confirm.');
  if(await run(node,[launch,'--workspace',workspace,'--dry-run'])!==0) throw new Error('Workspace preview failed. Install/sign in to official Antigravity or fix the reported conflict, then run Connect again.');
  if((await ask('Connect this workspace and open Antigravity? Type yes: ')).trim().toLowerCase()!=='yes') {
    tell('Stopped after preview. Keys were retained; no workspace integration was applied.');
    return {status:'cancelled',workspace};
  }
  tell('In Antigravity, first ask: Call omni_models and show enabled workers.');
  tell('Then ask: Use omni_route with routingMode="regular" to explain a variable in one sentence; show its badge and route ID.');
  tell('Call omni_routes to verify the actual route. Host quota still applies; setup does not prove automatic tool adherence.');
  if(await run(node,[launch,'--workspace',workspace,'--apply'])!==0) throw new Error('Antigravity launch failed or exited with an error. The workspace may already be connected; inspect the output before retrying.');
  return {status:'launched',workspace};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await runGuidedSetup({root:process.env.OMNIROUTE_REGULAR_ROOT});}
  catch(error) {console.error(error.message);process.exitCode=1;}
}
