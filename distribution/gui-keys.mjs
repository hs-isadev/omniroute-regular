import {join,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
export function keyFormCommand(root,{platform=process.platform,node=process.execPath,app=dirname(dirname(fileURLToPath(import.meta.url))),systemRoot=process.env.SystemRoot??'C:\\Windows'}={}) {
  if(![root,node,app].every(isAbsolute))throw new Error('Absolute form paths required');
  const runtime=join(root,'data');
  if(platform==='win32')return {command:join(systemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),args:['-NoLogo','-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',join(app,'distribution/Settings.ps1'),'-InstallRoot',root,'-AppRoot',app,'-NodePath',node,'-RuntimeRoot',runtime,'-Simple','-RequireReady']};
  if(platform==='linux')return {command:'/usr/bin/python3',args:['-I',join(app,'distribution/settings-gui.py'),'--node',node,'--app',app,'--runtime',runtime]};
  throw new Error('Windows or Linux is required');
}
export async function openKeyForm(root) {
  const spec=keyFormCommand(root);
  await new Promise((resolve,reject)=>{const child=spawn(spec.command,spec.args,{shell:false,stdio:'inherit',windowsHide:true});child.once('error',()=>reject(new Error('Key form could not open. Rerun Setup to install its desktop dependencies.')));child.once('exit',code=>code===0?resolve():reject(new Error('Key setup not completed. Reopen OmniRoute API Keys when ready.')));});
}
