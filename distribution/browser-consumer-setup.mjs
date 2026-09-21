import {access,mkdir,readFile,unlink,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {getRuntimePaths,loadConfig,saveConfig} from '../packages/config/dist/index.js';
import {PRIVATE_BROWSER_CONSUMERS,getSharedSessionDefinition} from '../packages/browser-consumer-adapter/src/runtime.mjs';

const session=getSharedSessionDefinition();
const endpoint=`http://127.0.0.1:${session.port}`;
const localOnly=(path,label)=>{if(!isAbsolute(path)||/[\r\n\0\"]/.test(path))throw new Error(`Absolute ${label} path required.`);return path;};
const activeVersion=async root=>{
  const active=(await readFile(join(root,'active-version.txt'),'utf8')).trim();
  if(!/^versions\/[a-zA-Z0-9.-]+$/.test(active))throw new Error('Invalid active version.');
  return active;
};
export function browserConsumerCommand(action,{root,node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/browser-consumer-adapter/src/shared-session.mjs',import.meta.url))}={}) {
  localOnly(root,'installation root');localOnly(node,'Node runtime');localOnly(entrypoint,'browser session');
  if(action!=='launch')throw new Error('Unsupported browser consumer command.');
  return [node,entrypoint,'--launch-only','--profile',join(root,'data',session.profileName),'--port',String(session.port)];
}
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',shell:false,windowsHide:false});child.once('error',()=>reject(new Error('Could not start the browser sign-in session.')));child.once('exit',code=>resolve(code??1));});}
export async function launchBrowserConsumerSignIn({root,node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/browser-consumer-adapter/src/shared-session.mjs',import.meta.url)),run:runImpl=run}={}) {
  return runImpl(...browserConsumerCommand('launch',{root,node,entrypoint}));
}
function configure(provider,{node,entrypoint,args}){
  Object.assign(provider,{enabled:true,freeTierConfirmed:true,baseUrl:endpoint,mcpCommand:node,mcpArgs:[entrypoint,...args],mcpWorkingDirectory:dirname(entrypoint)});
}
export async function enableBrowserConsumers({root,node=process.execPath,adapterEntrypoint=fileURLToPath(new URL('../packages/browser-consumer-adapter/src/adapter.mjs',import.meta.url)),claudeEntrypoint=fileURLToPath(new URL('../packages/claude-consumer-adapter/src/adapter.mjs',import.meta.url)),zaiEntrypoint=fileURLToPath(new URL('../packages/zai-consumer-adapter/src/adapter.mjs',import.meta.url))}={}) {
  for(const [path,label] of [[root,'installation root'],[node,'Node runtime'],[adapterEntrypoint,'browser adapter'],[claudeEntrypoint,'Claude adapter'],[zaiEntrypoint,'Z.AI adapter']])localOnly(path,label);
  const paths=getRuntimePaths(join(root,'data')),config=await loadConfig(paths);
  const provider=id=>{const value=config.providers.find(item=>item.id===id);if(!value)throw new Error(`This build does not include the ${id} provider.`);return value;};
  configure(provider('claude-consumer'),{node,entrypoint:claudeEntrypoint,args:['--endpoint',endpoint]});
  configure(provider('zai-consumer'),{node,entrypoint:zaiEntrypoint,args:['--endpoint',endpoint]});
  for(const item of PRIVATE_BROWSER_CONSUMERS)configure(provider(item.providerId),{node,entrypoint:adapterEntrypoint,args:['--provider',item.id,'--endpoint',endpoint]});
  const consumerIds=new Set(['claude-consumer','zai-consumer',...PRIVATE_BROWSER_CONSUMERS.map(item=>item.providerId)]);
  config.routing.directProviderOrder=['claude-consumer','zai-consumer',...PRIVATE_BROWSER_CONSUMERS.map(item=>item.providerId),...config.routing.directProviderOrder.filter(id=>!consumerIds.has(id))];
  await saveConfig(config,paths);
  return config;
}
function desktopQuote(value){return `"${String(value).replaceAll('"','\\"')}"`;}
export async function installBrowserConsumerAutostart({platform=process.platform,home=homedir(),root,node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/browser-consumer-adapter/src/shared-session.mjs',import.meta.url)),env=process.env}={}) {
  for(const [path,label] of [[home,'home'],[root,'installation root'],[node,'Node runtime'],[entrypoint,'browser session']])localOnly(path,label);
  for(const [path,label] of [[node,'Node runtime'],[entrypoint,'browser session']])try{await access(path);}catch{throw new Error(`${label} was not found: ${path}`);}
  const profile=join(root,'data',session.profileName),args=`--launch-only --profile ${desktopQuote(profile)} --port ${session.port}`;
  const file=platform==='linux'?join(home,'.config/autostart/omniroute-browser-consumers.desktop'):platform==='win32'?join(env.APPDATA??'','Microsoft/Windows/Start Menu/Programs/Startup/OmniRoute Browser Consumers.cmd'):null;
  if(!file||!isAbsolute(file))throw new Error('Shared browser consumer autostart supports Windows and Linux desktops.');
  const content=platform==='linux'?`[Desktop Entry]\nType=Application\nName=OmniRoute Browser Consumers\nExec=${desktopQuote(node)} ${desktopQuote(entrypoint)} ${args}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`:`@echo off\r\nstart "" /b ${desktopQuote(node)} ${desktopQuote(entrypoint)} ${args}\r\n`;
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  let before=null;try{before=await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(before!==null&&before!==content)throw new Error(`Existing browser autostart entry is user-managed: ${file}`);
  if(before!==content)await writeFile(file,content,{mode:0o600});
  let legacyRemoved=false;
  if(platform==='win32'){
    const legacy=join(dirname(file),'OmniRoute Browser Consumers.vbs');
    try{
      const legacyText=await readFile(legacy,'utf8');
      if(!/CreateObject\("WScript\.Shell"\)\.Run/i.test(legacyText)||!/shared-session\.mjs/i.test(legacyText)||!/--port\s+47842/.test(legacyText))throw new Error(`Existing browser autostart entry is user-managed: ${legacy}`);
      await unlink(legacy);legacyRemoved=true;
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return {file,legacyRemoved};
}
function rootFromArgs(args){const index=args.indexOf('--root'),root=index>=0?args[index+1]:undefined;if(index<0||!root||index!==args.length-2)throw new Error('Use launch or enable with --root ABSOLUTE_INSTALL_ROOT.');return root;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [action,...args]=process.argv.slice(2),root=rootFromArgs(args),active=await activeVersion(root),node=process.execPath;
    const app=join(root,active,'app/packages');
    if(action==='launch')process.exitCode=await launchBrowserConsumerSignIn({root,node,entrypoint:join(app,'browser-consumer-adapter/src/shared-session.mjs')});
    else if(action==='enable'){await enableBrowserConsumers({root,node,adapterEntrypoint:join(app,'browser-consumer-adapter/src/adapter.mjs'),claudeEntrypoint:join(app,'claude-consumer-adapter/src/adapter.mjs'),zaiEntrypoint:join(app,'zai-consumer-adapter/src/adapter.mjs')});await installBrowserConsumerAutostart({root,node,entrypoint:join(app,'browser-consumer-adapter/src/shared-session.mjs')});console.log('Browser consumers enabled for the manually signed-in free-tier accounts you selected.');}
    else throw new Error('Expected launch or enable.');
  }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
