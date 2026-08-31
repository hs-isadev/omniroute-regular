import { constants } from 'node:fs';
import { access, chmod, lstat, mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configure, fields } from './settings.mjs';
import { CREDIT_PROVIDERS } from './regular-policy.mjs';
import { getRuntimePaths, EXTRA_FREE_PROVIDERS } from '../packages/config/dist/index.js';
const execute=promisify(execFile),MAX=65536;
const supported=Object.fromEntries(Object.entries(fields).filter(([id])=>!CREDIT_PROVIDERS.includes(id)));
const allowed=new Set(Object.values(supported).flat());
const links={groq:'https://console.groq.com/keys',gemini:'https://aistudio.google.com/apikey',openrouter:'https://openrouter.ai/settings/keys',...Object.fromEntries(EXTRA_FREE_PROVIDERS.map(p=>[p.id,p.signup]))};
export function parseKeyFile(text) {
  if(Buffer.byteLength(text)>MAX||text.includes('\0')) throw new Error('Key file is too large or contains invalid characters.');
  const output={},seen=new Set();
  for(const [index,raw] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const at=line.indexOf('='),name=line.slice(0,at).trim();
    if(at<1||!allowed.has(name)||seen.has(name)) throw new Error('Unknown, duplicate or malformed credential field at line '+(index+1)+'.');
    seen.add(name);let value=line.slice(at+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    if(value.length>4096||/[\r\n\0]/.test(value)||value.endsWith('\\'))throw new Error('Invalid single-line credential at line '+(index+1)+'.');
    if(value)output[name]=value;
  }
  return output;
}
export async function checkPrivateLocation(path) {
  if(!isAbsolute(path)||/[\r\n\0]/.test(path)) throw new Error('Absolute private input path required.');
  if(/(?:^|[\\/])(?:onedrive[^\\/]*|dropbox|google drive|icloud[^\\/]*)(?:[\\/]|$)/i.test(path))throw new Error('Key files must not be in a sync directory. Use masked Settings instead.');
  for(let cursor=resolve(path);;cursor=dirname(cursor)) {
    try {
      const info=await lstat(cursor);if(info.isSymbolicLink())throw new Error('Symlink/reparse key paths are not allowed.');
      if(info.isFile()&&info.nlink!==1)throw new Error('Hardlinked key files are not allowed.');
    }catch(error){if(error.code!=='ENOENT')throw error;}
    try {await access(join(cursor,'.git'));throw new Error('Key files must be outside a repository. Use masked Settings instead.');}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
    if(cursor===dirname(cursor))break;
  }
}
async function restrict(path,directory=false) {
  await checkPrivateLocation(path);
  if(process.platform==='win32') {
    const shell=join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    try {await execute(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./private-key-path.ps1',import.meta.url)),'-Target',path],{windowsHide:true});}
    catch {throw new Error('Could not restrict key-file permissions; use masked Settings.');}
  } else {
    if((await lstat(path)).uid!==process.getuid())throw new Error('Private key path is owned by another user.');
    await chmod(path,directory?0o700:0o600);
  }
}
async function savedProviders(paths) {
  // Metadata only. Never decrypt/export saved values into an editor template.
  try {const data=JSON.parse(await readFile(paths.vault,'utf8'));return new Set(Object.keys(data.records??{}).filter(id=>Object.hasOwn(supported,id)));}
  catch(error){if(error.code==='ENOENT')return new Set();throw new Error('Cannot read saved-provider metadata. Existing vault was not changed.');}
}
function template(saved,remaining={}) {
  const lines=['# OmniRoute Regular API keys - edit ONLY the values after =.',
    '# Existing saved keys are never shown here. Blank = keep saved key.',
    '# Save and CLOSE this editor, then return to setup and confirm import.',
    '# Use free-plan/evaluation accounts only; billing, paid overages, BYOK and auto-top-up OFF.',
    '# Never enter account passwords, browser cookies or host login sessions.',
    '# Plaintext risk: disable editor autosave/session backups. Cleanup is NOT secure erasure.',
    '# Successful values are removed from this file; failed values remain for retry.',
    '# Hugging Face and Vercel credit-based providers are disabled in Regular mode.',''];
  for(const [id,names] of Object.entries(supported)) {
    lines.push('# '+id+': '+(saved.has(id)?'saved (blank keeps it)':'not configured'),'# Get key: '+links[id]);
    const note=EXTRA_FREE_PROVIDERS.find(p=>p.id===id)?.note;
    if(note)lines.push('# '+note);
    for(const name of names)lines.push(name+'='+(remaining[name]??''));
    lines.push('');
  }
  return lines.join('\n');
}
async function privateRead(file) {
  await checkPrivateLocation(file);
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {
    const info=await handle.stat();if(!info.isFile()||info.nlink!==1)throw new Error('Key input must be a regular non-linked file.');
    if(info.size>MAX)throw new Error('Key file is too large.');
    return {text:await handle.readFile('utf8'),info};
  }finally{await handle.close();}
}
export async function prepareKeyFile({dir,paths}) {
  await checkPrivateLocation(dir);await mkdir(dir,{recursive:true,mode:0o700});await restrict(dir,true);
  const file=join(dir,'credentials.txt');await checkPrivateLocation(file);
  const saved=await savedProviders(paths);
  try {const handle=await open(file,'wx',0o600);try {await handle.writeFile(template(saved));}finally{await handle.close();}}
  catch(error){if(error.code!=='EEXIST')throw error;await privateRead(file);}
  await restrict(file);return file;
}
export async function importKeyFile({file,paths,freeOnlyConfirmed,validateCodingCandidates=false,protector,factory}) {
  if(freeOnlyConfirmed!==true)throw new Error('Confirm free-only accounts and import first.');
  await restrict(dirname(file),true);await restrict(file);
  const snapshot=await privateRead(file),keys=parseKeyFile(snapshot.text);
  try {
    const result=await configure({keys,freeOnlyConfirmed,validateCodingCandidates},paths,{protector,factory});
    const saved=await savedProviders(paths),remaining={};
    for(const id of result.failed)for(const name of supported[id]??[])if(keys[name])remaining[name]=keys[name];
    await checkPrivateLocation(file);
    const handle=await open(file,constants.O_RDWR|(constants.O_NOFOLLOW??0));
    try {
      const now=await handle.stat();
      if(now.nlink!==1||now.dev!==snapshot.info.dev||now.ino!==snapshot.info.ino||await handle.readFile('utf8')!==snapshot.text)throw new Error('Key file changed during validation. Encrypted keys were saved, but plaintext cleanup stopped to preserve your edits.');
      // Rewrite only this owned file. Do not hunt/delete editor recovery files.
      const bytes=Buffer.from(template(saved,remaining));await handle.write(bytes,0,bytes.length,0);await handle.truncate(bytes.length);await handle.sync();
    }finally{await handle.close();}
    return result;
  }finally{for(const name of Object.keys(keys))keys[name]='';}
}
async function ask(label) {const ui=createInterface({input:process.stdin,output:process.stdout});try{return await ui.question(label);}finally{ui.close();}}
export async function editorCommand(file,platform=process.platform) {
  if(platform==='win32')return {command:join(process.env.SystemRoot??'C:\\Windows','System32/notepad.exe'),args:[file]};
  if(platform!=='linux')throw new Error('Windows or Linux is required.');
  for(const command of ['/usr/bin/xdg-open','/usr/bin/gnome-text-editor','/usr/bin/gedit','/usr/bin/kate','/usr/bin/mousepad']) {
    try {await access(command,constants.X_OK);return {command,args:[file]};}catch{}
  }
  throw new Error('No Linux desktop text editor found. Run Settings.sh for hidden terminal entry.');
}
export async function runEditorSetup({paths=getRuntimePaths(),prompt=ask,launch=async spec=>execute(spec.command,spec.args,{windowsHide:true}),dir}={}) {
  if(!process.stdin.isTTY)throw new Error('Key editor setup needs an interactive terminal.');
  const base=process.platform==='win32'?process.env.LOCALAPPDATA:join(homedir(),'.local/share');
  if(!base||!isAbsolute(base))throw new Error('Cannot locate private local application storage.');
  dir??=join(base,'OmniRouteRegular-KeyEntry',createHash('sha256').update(paths.root).digest('hex').slice(0,16));
  const file=await prepareKeyFile({dir,paths});
  console.log('Opening key slots. Saved provider names are marked; their keys are never exported.');
  console.log('File: '+file+'\nPlaintext warning: disable editor session backups; save and CLOSE the editor before importing.');
  const spec=await editorCommand(file);await launch(spec).catch(()=>{throw new Error('Editor could not open. Your pending file is preserved; use masked Settings if needed.');});
  const confirmation=await prompt('After saving and closing: confirm FREE accounts, no billing/overages/BYOK/top-up, and import? Type yes: ');
  if(confirmation.trim().toLowerCase()!=='yes')throw new Error('Import cancelled. Any pending plaintext stays in the displayed file; remove it locally if no longer needed.');
  const validateCodingCandidates=(await prompt('Also test Kimi/Qwen candidates (extra free quota)? Type yes, or Enter to skip: ')).trim().toLowerCase()==='yes';
  console.log('Validating small requests against trusted free-provider profiles...');
  const result=await importKeyFile({file,paths,freeOnlyConfirmed:true,validateCodingCandidates});
  console.log('Ready. Saved: '+(result.accepted.join(', ')||'existing keys retained')+'. Successful plaintext values removed.');
  if(result.failed.length)console.log('Not updated: '+result.failed.join(', ')+'. These values remain in the file for retry; existing saved keys were kept.');
  console.log('Editor backups, clipboard history and storage snapshots are outside this cleanup.');
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await runEditorSetup();}catch(error){console.error(error.message);process.exitCode=1;}
}
