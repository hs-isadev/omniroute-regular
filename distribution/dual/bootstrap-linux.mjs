import {access,mkdir,readFile,writeFile,chmod,lstat} from 'node:fs/promises';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),root=process.argv[2];
if(process.platform!=='linux'||process.getuid()===0||!root||!isAbsolute(root))throw new Error('Use normal-user Linux Setup');
async function safe(path){for(let p=resolve(path);;p=dirname(p)){try{if((await lstat(p)).isSymbolicLink())throw new Error('Linked installer destination rejected');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===dirname(p))break;}}
await safe(root);
const archive=join(root,'downloads/Antigravity-2.11.0-linux-x64.tar.gz');await safe(archive);
const digest='43b1e257fd2614ddb9a5a578b03f8ac391f6579b3b06283abe15964157f65129';
const hostRoot=join(root,'hosts/antigravity-2.11.0'),app=join(hostRoot,'Antigravity-x64/antigravity');
await safe(app);
try{await access(app);}catch{
  await mkdir(dirname(archive),{recursive:true,mode:0o700});let bytes;
  try{bytes=await readFile(archive);}catch(e){if(e.code!=='ENOENT')throw e;const response=await fetch('https://storage.googleapis.com/antigravity-public/antigravity-hub/2.11.0-6376446768316416/linux-x64/Antigravity.tar.gz',{signal:AbortSignal.timeout(300000),redirect:'error'});if(!response.ok)throw new Error('Google download failed');bytes=Buffer.from(await response.arrayBuffer());}
  if(createHash('sha256').update(bytes).digest('hex')!==digest)throw new Error('Google archive checksum failed');
  await writeFile(archive,bytes,{mode:0o600});
  const {stdout}=await run('tar',['-tzf',archive],{maxBuffer:16*1024*1024});
  if(stdout.split('\n').filter(Boolean).some(p=>p.startsWith('/')||p.includes('\\')||p.split('/').includes('..')||!p.startsWith('Antigravity-x64/')))throw new Error('Unsafe archive path');
  await mkdir(hostRoot,{mode:0o700});await run('tar',['-xzf',archive,'-C',hostRoot]);await access(app);
}
await writeFile(join(root,'antigravity-path.txt'),app+'\n',{mode:0o600});
const applications=join(process.env.XDG_DATA_HOME??join(homedir(),'.local/share'),'applications');await safe(applications);await mkdir(applications,{recursive:true});
const quote=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('`','\\`').replaceAll('$','\\$').replaceAll('%','%%')+'"';
for(const [label,action] of [['OpenCode','opencode'],['Antigravity','antigravity'],['API Keys','keys'],['Usage','usage']]){
  const file=join(applications,'omniroute-'+action+'.desktop');await safe(file);
  const content='[Desktop Entry]\nType=Application\nName=OmniRoute '+label+'\nExec=sh '+quote(join(root,'Launch.sh'))+' '+action+'\nTerminal='+(action==='opencode'||action==='usage')+'\nCategories=Development;\n';
  let old;try{old=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old&&!old.includes('Name=OmniRoute '+label+'\n'))throw new Error('Unrelated desktop launcher preserved');
  await writeFile(file,content,{mode:0o600});
}
console.log('Official Antigravity downloaded and application-menu launchers installed. Sandbox settings unchanged.');
