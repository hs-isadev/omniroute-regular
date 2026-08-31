import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve, isAbsolute } from 'node:path';
import { integrateWorkspace, removeWorkspaceIntegration, findAntigravity, hostEnvironment, DOWNLOAD_URL } from './antigravity.mjs';

export async function prepareLaunch(options) {
  const {root,workspace,apply=false}=options;
  if(!root||!workspace||!isAbsolute(root)||!isAbsolute(workspace)) throw new Error('Use absolute installation and workspace paths.');
  const host=Object.hasOwn(options,'host')?options.host:await findAntigravity({executable:options.executable});
  if(!host) throw new Error('Install and sign in to the official Antigravity app or agy CLI first: '+DOWNLOAD_URL);
  if(!(await stat(workspace)).isDirectory()) throw new Error('Select an existing project directory.');
  const integration=await integrateWorkspace({workspace,node:process.execPath,entrypoint:fileURLToPath(new URL('./mcp-regular.mjs',import.meta.url)),runtimeRoot:join(root,'data'),apply});
  return {executable:host.executable,args:host.kind==='cli'?[]:[workspace],cwd:workspace,env:hostEnvironment(),integration};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2),root=process.env.OMNIROUTE_REGULAR_ROOT;
    if(!root||!isAbsolute(root)) throw new Error('Use the installed Launch script.');
    const value=name=>{const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for '+name);return args[i+1];};
    const workspace=resolve(value('--workspace')??join(root,'workspace'));
    if(!value('--workspace')&&!args.includes('--dry-run')) await mkdir(workspace,{recursive:true,mode:0o700});
    const apply=args.includes('--apply');
    if(args.includes('--detach')) {
      console.log(JSON.stringify(await removeWorkspaceIntegration({workspace,node:process.execPath,entrypoint:fileURLToPath(new URL('./mcp-regular.mjs',import.meta.url)),runtimeRoot:join(root,'data'),apply}),null,2));
    } else {
      const plan=await prepareLaunch({root,workspace,apply,executable:value('--host')});
      console.log(JSON.stringify({host:plan.executable,workspace,integration:plan.integration},null,2));
      if(args.includes('--dry-run')||!apply) console.log('Preview only. Rerun with --apply to configure this workspace and open Antigravity.');
      else {
        console.log('Antigravity is the host. OmniRoute supplies free workers through MCP; host quota still applies.');
        const child=spawn(plan.executable,plan.args,{cwd:plan.cwd,env:plan.env,stdio:'inherit',shell:false,windowsHide:false});
        for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>child.kill(signal));
        process.exitCode=await new Promise((res,rej)=>{child.once('error',rej);child.once('exit',code=>res(code??1));});
      }
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
