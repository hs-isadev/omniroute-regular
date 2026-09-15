import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';

const SAFE_ENVIRONMENT=['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','PROGRAMDATA','USERNAME','USERDOMAIN','OS','HOME','USER','SHELL','TMPDIR','TERM','TERM_PROGRAM','COLORTERM','LANG','LC_ALL','NO_COLOR','FORCE_COLOR','WT_SESSION','WT_PROFILE_ID'];

function validatePath(path,label){
  if(typeof path!=='string'||!isAbsolute(path)||/[\r\n\0]/.test(path))throw new Error(`Invalid ${label} path.`);
  return path;
}

function safeEnvironment(base,root){
  const environment={};
  for(const wanted of SAFE_ENVIRONMENT){
    const actual=Object.keys(base).find(key=>key.toUpperCase()===wanted);
    if(actual&&base[actual]!==undefined)environment[actual]=base[actual];
  }
  environment.OMNIROUTE_HOME=join(root,'data');
  environment.OMNIROUTE_ROUTING_MODE='regular';
  return environment;
}

async function runQuiet(command,args,env){
  await new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{env,stdio:'ignore',shell:false,windowsHide:true});
    child.once('error',()=>reject(new Error('Devin CLI could not start.')));
    child.once('exit',code=>code===0?resolvePromise():reject(new Error('Devin CLI registration needs attention.')));
  });
}

async function runInteractive(command,args,env){
  await new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{env,stdio:'inherit',shell:false,windowsHide:false});
    child.once('error',()=>reject(new Error('Devin CLI could not start.')));
    child.once('exit',code=>code===0?resolvePromise():reject(new Error('Devin login needs attention.')));
  });
}

export function devinMcpArguments({root,node,entrypoint}){
  validatePath(root,'install root');validatePath(node,'Node executable');validatePath(entrypoint,'MCP entrypoint');
  return ['mcp','add','-s','user','-e',`OMNIROUTE_HOME=${join(root,'data')}`,'-e','OMNIROUTE_ROUTING_MODE=regular','omniroute_regular','--',node,entrypoint];
}

export async function configureDevinCli({root,node,entrypoint,executable,run=runQuiet,env=process.env}){
  if(executable===null||executable===undefined)return {status:'not-installed'};
  validatePath(executable,'Devin executable');
  try{
    await run(executable,devinMcpArguments({root,node,entrypoint}),safeEnvironment(env,root));
    return {status:'configured'};
  }catch{
    // Do not read, replace, or delete a user-owned Devin configuration to resolve a duplicate or other error.
    return {status:'needs-user-review'};
  }
}

export async function launchDevinCli({root,executable,run=runInteractive,env=process.env}){
  if(executable===null||executable===undefined)return {status:'not-installed'};
  validatePath(root,'install root');validatePath(executable,'Devin executable');
  await run(executable,['auth','login'],safeEnvironment(env,root));
  return {status:'login-finished'};
}
