import {access,readFile,writeFile,mkdir,lstat,copyFile,rename} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {getRuntimePaths,saveConfig,loadConfig} from '../packages/config/dist/index.js';
import {IntegrationManager,defaultHostPaths} from '../packages/integrations/dist/index.js';
import {AuditStore} from '../packages/observability/dist/index.js';
import {regularConfig} from './settings.mjs';
import {openKeyForm} from './gui-keys.mjs';
import {RULES,findAntigravity} from './antigravity.mjs';
import {claudeHarnessEnvironment} from '../apps/cli/dist/harness-env.js';
import {createChatBackend,startChatProxy,openCodeConfig} from './dual-chat.mjs';
const CLAUDE_CONSUMER_PORT=47842;
const CLAUDE_CONSUMER_ENDPOINT=`http://127.0.0.1:${CLAUDE_CONSUMER_PORT}`;
const ZAI_CONSUMER_PORT=47843;
const ZAI_CONSUMER_ENDPOINT=`http://127.0.0.1:${ZAI_CONSUMER_PORT}`;

async function safe(path){for(let p=resolve(path);;p=dirname(p)){try{const info=await lstat(p);if(info.isSymbolicLink()||(info.isFile()&&info.nlink!==1))throw new Error('Linked setup path rejected');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===dirname(p))break;}}
async function optional(path){await safe(path);try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function atomic(path,text,before){await safe(path);await mkdir(dirname(path),{recursive:true,mode:0o700});if(await optional(path)!==before)throw new Error('Concurrent configuration conflict');if(before!==null)await copyFile(path,path+'.backup-'+randomUUID());const temp=path+'.tmp-'+randomUUID();await writeFile(temp,text,{flag:'wx',mode:0o600});if(await optional(path)!==before)throw new Error('Concurrent configuration conflict');await rename(temp,path);}
export async function connectAntigravity({home=homedir(),root,node=process.execPath,entrypoint=fileURLToPath(new URL('./mcp-regular.mjs',import.meta.url))}) {
  for(const path of [home,root,node,entrypoint])if(!isAbsolute(path))throw new Error('Absolute paths required');
  const file=join(home,'.gemini/config/mcp_config.json'),raw=await optional(file);
  const config=raw===null?{}:JSON.parse(raw.replace(/^\uFEFF/,''));
  if(!config||Array.isArray(config)||typeof config!=='object'||(config.mcpServers!==undefined&&(!config.mcpServers||Array.isArray(config.mcpServers)||typeof config.mcpServers!=='object')))throw new Error('Invalid existing MCP configuration');
  const entry={command:node,args:[entrypoint],env:{OMNIROUTE_HOME:join(root,'data'),OMNIROUTE_ROUTING_MODE:'regular'}};
  const ownerFile=join(root,'antigravity-owner.json'),ownerRaw=await optional(ownerFile),owner=ownerRaw?JSON.parse(ownerRaw):null;
  const previous=config.mcpServers?.omniroute_regular;
  if(previous&&JSON.stringify(previous)!==JSON.stringify(entry)&&JSON.stringify(previous)!==JSON.stringify(owner?.entry)){
    // Recognize the exact v0.2 managed installation shape, never arbitrary commands.
    const oldRoot=resolve(root).replaceAll('\\','/');
    const command=typeof previous.command==='string'?resolve(previous.command).replaceAll('\\','/') : '';
    const script=typeof previous.args?.[0]==='string'?resolve(previous.args[0]).replaceAll('\\','/') : '';
    const prefix=oldRoot+'/versions/';
    const own=command.startsWith(prefix)&&/\/node\/node(?:\.exe)?$/.test(command)&&script.startsWith(prefix)&&/\/app\/distribution\/mcp-regular\.mjs$/.test(script)&&previous.args.length===1&&JSON.stringify(previous.env)===JSON.stringify(entry.env)&&Object.keys(previous).sort().join(',')==='args,command,env';
    if(!own)throw new Error('Antigravity OmniRoute entry conflict; original preserved');
  }
  config.mcpServers={...config.mcpServers,omniroute_regular:entry};
  if(JSON.stringify(previous)!==JSON.stringify(entry))await atomic(file,JSON.stringify(config,null,2)+'\n',raw);
  const ruleFile=join(home,'.gemini/GEMINI.md'),before=await optional(ruleFile);
  if(!(before??'').includes('<!-- BEGIN OMNIROUTE ANTIGRAVITY SETUP -->')){
    const rule=(before??'')+'\n<!-- BEGIN OMNIROUTE ANTIGRAVITY SETUP -->\n'+RULES.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'')+'<!-- END OMNIROUTE ANTIGRAVITY SETUP -->\n';
    if(rule.length>12000)throw new Error('Global rules too large; existing rules preserved');
    await atomic(ruleFile,rule,before);
  }
  const next=JSON.stringify({entry},null,2)+'\n';if(ownerRaw!==next)await atomic(ownerFile,next,ownerRaw);
  return {file,ruleFile};
}
export async function connectDeveloperHosts({home=homedir(),root,node=process.execPath,entrypoint=fileURLToPath(new URL('./mcp-regular.mjs',import.meta.url))}) {
  for(const path of [home,root,node,entrypoint])if(!isAbsolute(path))throw new Error('Absolute paths required');
  const manager=new IntegrationManager({hostPaths:defaultHostPaths(home),runtimePaths:getRuntimePaths(join(root,'data')),nodePath:node,cliPath:entrypoint});
  const connected=[];
  for(const target of ['codex','claude-code']){const plan=await manager.plan(target,'install');if(plan.changed)await manager.apply(plan);connected.push(target);}
  return {connected};
}
export async function configureClaudeConsumer({root,node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/claude-consumer-adapter/src/adapter.mjs',import.meta.url))}) {
  for(const path of [root,node,entrypoint])if(!isAbsolute(path))throw new Error('Absolute Claude consumer paths required');
  const paths=getRuntimePaths(join(root,'data')),config=await loadConfig(paths);
  const provider=config.providers.find(item=>item.id==='claude-consumer');
  if(!provider)throw new Error('This build does not include the Claude consumer provider.');
  Object.assign(provider,{enabled:true,freeTierConfirmed:true,baseUrl:CLAUDE_CONSUMER_ENDPOINT,mcpCommand:node,mcpArgs:[entrypoint,'--endpoint',CLAUDE_CONSUMER_ENDPOINT],mcpWorkingDirectory:dirname(entrypoint)});
  config.routing.directProviderOrder=['claude-consumer',...config.routing.directProviderOrder.filter(id=>id!=='claude-consumer')];
  await saveConfig(config,paths);
  return {providerId:provider.id,entrypoint};
}
export async function configureZaiConsumer({root,node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/zai-consumer-adapter/src/adapter.mjs',import.meta.url))}) {
  for(const path of [root,node,entrypoint])if(!isAbsolute(path))throw new Error('Absolute Z.AI consumer paths required');
  const paths=getRuntimePaths(join(root,'data')),config=await loadConfig(paths);
  const provider=config.providers.find(item=>item.id==='zai-consumer');
  if(!provider)throw new Error('This build does not include the Z.AI consumer provider.');
  Object.assign(provider,{enabled:true,freeTierConfirmed:true,baseUrl:ZAI_CONSUMER_ENDPOINT,mcpCommand:node,mcpArgs:[entrypoint,'--endpoint',ZAI_CONSUMER_ENDPOINT],mcpWorkingDirectory:dirname(entrypoint)});
  config.routing.directProviderOrder=['claude-consumer','zai-consumer',...config.routing.directProviderOrder.filter(id=>id!=='claude-consumer'&&id!=='zai-consumer')];
  await saveConfig(config,paths);
  return {providerId:provider.id,entrypoint};
}
function desktopExec(value){return `"${String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;}
export async function installClaudeConsumerAutostart({platform=process.platform,home=homedir(),root,node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/claude-consumer-adapter/src/credential-server.mjs',import.meta.url)),env=process.env}) {
  for(const path of [home,root,node,entrypoint])if(!isAbsolute(path))throw new Error('Absolute Claude autostart paths required');
  const profile=join(root,'data/claude-consumer-profile');
  if(platform==='linux'){
    const file=join(home,'.config/autostart/omniroute-claude-consumer.desktop'),before=await optional(file);
    const content=`[Desktop Entry]\nType=Application\nName=OmniRoute Claude Consumer\nExec=${desktopExec(node)} ${desktopExec(entrypoint)} --background --profile ${desktopExec(profile)} --port ${CLAUDE_CONSUMER_PORT}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
    if(before!==content)await atomic(file,content,before);
    return {file};
  }
  if(platform==='win32'){
    const appData=env.APPDATA;if(!appData||!isAbsolute(appData))throw new Error('Windows APPDATA is unavailable.');
    const file=join(appData,'Microsoft/Windows/Start Menu/Programs/Startup/OmniRoute Claude Consumer.vbs'),before=await optional(file);
    const command=`"${node}" "${entrypoint}" --background --profile "${profile}" --port ${CLAUDE_CONSUMER_PORT}`,content=`CreateObject("WScript.Shell").Run "${command.replaceAll('"','""')}", 0, False\r\n`;
    if(before!==content)await atomic(file,content,before);
    return {file};
  }
  throw new Error('Claude consumer autostart supports Windows and Linux desktops.');
}
export async function installZaiConsumerAutostart({platform=process.platform,home=homedir(),root,node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/zai-consumer-adapter/src/credential-server.mjs',import.meta.url)),env=process.env}) {
  for(const path of [home,root,node,entrypoint])if(!isAbsolute(path))throw new Error('Absolute Z.AI autostart paths required');
  const profile=join(root,'data/zai-consumer-profile');
  if(platform==='linux'){
    const file=join(home,'.config/autostart/omniroute-zai-consumer.desktop'),before=await optional(file);
    const content=`[Desktop Entry]\nType=Application\nName=OmniRoute Z.AI Consumer\nExec=${desktopExec(node)} ${desktopExec(entrypoint)} --background --profile ${desktopExec(profile)} --port ${ZAI_CONSUMER_PORT}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
    if(before!==content)await atomic(file,content,before);
    return {file};
  }
  if(platform==='win32'){
    const appData=env.APPDATA;if(!appData||!isAbsolute(appData))throw new Error('Windows APPDATA is unavailable.');
    const file=join(appData,'Microsoft/Windows/Start Menu/Programs/Startup/OmniRoute Z.AI Consumer.vbs'),before=await optional(file);
    const command=`"${node}" "${entrypoint}" --background --profile "${profile}" --port ${ZAI_CONSUMER_PORT}`,content=`CreateObject("WScript.Shell").Run "${command.replaceAll('"','""')}", 0, False\r\n`;
    if(before!==content)await atomic(file,content,before);
    return {file};
  }
  throw new Error('Z.AI consumer autostart supports Windows and Linux desktops.');
}
export function openCodeEnvironment(base,root,inline) {
  const env=claudeHarnessEnvironment(base,'regular',join(root,'data'));
  Object.assign(env,{XDG_CONFIG_HOME:join(root,'opencode/config'),XDG_DATA_HOME:join(root,'opencode/share'),XDG_CACHE_HOME:join(root,'opencode/cache'),XDG_STATE_HOME:join(root,'opencode/state'),OPENCODE_CONFIG_DIR:join(root,'opencode/config'),OPENCODE_CONFIG_CONTENT:inline,OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_LSP_DOWNLOAD:'true',OPENCODE_DISABLE_CLAUDE_CODE:'true',OPENCODE_DISABLE_DEFAULT_PLUGINS:'true'});
  return env;
}
function run(command,args,options={}){return new Promise((res,rej)=>{const child=spawn(command,args,{stdio:'inherit',shell:false,windowsHide:true,...options});child.once('error',rej);child.once('exit',code=>code===0?res():rej(new Error('Setup step failed ('+code+').')));});}
export async function launchClaudeConsumerSetup(root,{node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/claude-consumer-adapter/src/credential-server.mjs',import.meta.url))}={}) {
  await run(node,[entrypoint,'--profile',join(root,'data/claude-consumer-profile'),'--port',String(CLAUDE_CONSUMER_PORT)]);
}
export async function launchZaiConsumerSetup(root,{node=process.execPath,entrypoint=fileURLToPath(new URL('../packages/zai-consumer-adapter/src/credential-server.mjs',import.meta.url))}={}) {
  await run(node,[entrypoint,'--profile',join(root,'data/zai-consumer-profile'),'--port',String(ZAI_CONSUMER_PORT)]);
}
export async function launchConsumerSetups(root,{launchClaude=launchClaudeConsumerSetup,launchZai=launchZaiConsumerSetup}={}) {
  await Promise.all([launchClaude(root),launchZai(root)]);
}
export async function launchOpenCode(root,args=[]) {
  const active=(await readFile(join(root,'active-version.txt'),'utf8')).trim();if(!/^versions\/[a-zA-Z0-9.-]+$/.test(active))throw new Error('Invalid installed version');
  const backend=await createChatBackend(join(root,'data')),proxy=await startChatProxy(backend);
  const workspace=join(root,'workspace');await mkdir(workspace,{recursive:true});
  const env=openCodeEnvironment(process.env,root,JSON.stringify(openCodeConfig(proxy.baseURL,proxy.token)));
  try {await run(join(root,active,'opencode',process.platform==='win32'?'opencode.exe':'opencode'),[...args,'--pure','--model','omniroute/regular'],{cwd:workspace,env,windowsHide:false});}
  finally{await proxy.close();}
}
export async function launchAntigravity(root) {
  const saved=await optional(join(root,'antigravity-path.txt'));
  let app=saved?.trim();if(app)await access(app);
  if(!app){const found=await findAntigravity();if(found?.kind!=='gui'&&found?.kind!=='app'&&found?.kind!=='desktop'){
    if(process.platform==='win32'){const path=join(process.env.LOCALAPPDATA??'', 'Programs/antigravity/Antigravity.exe');try{await access(path);app=path;}catch{}}
  }else app=found.executable;}
  if(!app)throw new Error('Antigravity desktop is not installed. Rerun Setup to download the official app.');
  const child=spawn(app,[],{detached:true,stdio:'ignore',windowsHide:false});child.once('error',()=>console.error('Could not open Antigravity. Use its desktop shortcut.'));child.unref();
}
export async function showUsage(root) {
  const summary=await new AuditStore(getRuntimePaths(join(root,'data')).routes).tokenSavingsSummary();
  console.log(JSON.stringify(summary,null,2));return summary;
}
export async function setupBoth(root,{noKeys=false,noLaunch=false,home=homedir()}={}) {
  const paths=getRuntimePaths(join(root,'data'));
  if(await optional(paths.config)===null){const config=regularConfig();for(const p of config.providers){p.enabled=false;p.freeTierConfirmed=false;}await saveConfig(config,paths);}
  await connectAntigravity({root,home});
  await connectDeveloperHosts({root,home});
  console.log('Four hosts configured: OpenCode = OmniRoute main model; Antigravity, Codex and Claude Code = OmniRoute MCP workers.');
  if(!noKeys)await openKeyForm(root);
  await configureClaudeConsumer({root});
  await configureZaiConsumer({root});
  await installClaudeConsumerAutostart({root,home});
  await installZaiConsumerAutostart({root,home});
  console.log('Opening the dedicated Claude and Z.AI sign-in windows together. Each will minimize automatically when ready.');
  await launchConsumerSetups(root);
  console.log('Claude and Z.AI browser consumers are configured for small requests and running in the background.');
  if(!noLaunch)await launchAntigravity(root).catch(e=>console.log(e.message));
  console.log('Setup complete. Use OpenCode or open Antigravity, Codex, or Claude Code normally. Restart open hosts after changing keys.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [action,...args]=process.argv.slice(2),root=process.env.OMNIROUTE_REGULAR_ROOT;
    if(!root||!isAbsolute(root))throw new Error('Use an installed launcher');
    if(action==='opencode')await launchOpenCode(root,args);
    else if(action==='antigravity')await launchAntigravity(root);
    else if(action==='keys')await openKeyForm(root);
    else if(action==='usage')await showUsage(root);
    else if(action==='setup')await setupBoth(root,{noKeys:args.includes('--no-keys'),noLaunch:args.includes('--no-launch')});
    else throw new Error('Unknown setup action');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
