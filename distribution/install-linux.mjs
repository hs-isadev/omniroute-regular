import { mkdir, mkdtemp, readFile, writeFile, copyFile, chmod, lstat, readdir, symlink, rename, access } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export async function verifyPayload(bundle) {
  const payload=join(bundle,'payload');
  const manifest=JSON.parse(await readFile(join(bundle,'manifest.json'),'utf8'));
  if(manifest.platform!=='linux-x64' || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid Linux package manifest.');
  const expected=new Map();
  for(const entry of manifest.files) {
    if(typeof entry.path!=='string' || entry.path.includes('\\') || entry.path.split('/').some(p=>!p||p==='.'||p==='..') || isAbsolute(entry.path) || expected.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Unsafe package manifest entry.');
    expected.set(entry.path,entry.sha256);
  }
  const seen=new Set();
  async function walk(dir) {
    for(const item of await readdir(dir,{withFileTypes:true})) {
      const path=join(dir,item.name), name=relative(payload,path).split('\\').join('/');
      if(item.isDirectory()) await walk(path);
      else if(item.isFile()) {
        if(!expected.has(name) || createHash('sha256').update(await readFile(path)).digest('hex')!==expected.get(name)) throw new Error(`Package checksum failed: ${name}`);
        seen.add(name);
      } else throw new Error('Package contains a symlink or special file.');
    }
  }
  await walk(payload);
  if(seen.size!==expected.size) throw new Error('Package is incomplete.');
  return manifest;
}

export async function installLinux(bundle,root) {
  if(!isAbsolute(root) || root===resolve('/') || root===homedir()) throw new Error('Unsafe installation directory.');
  const manifest=await verifyPayload(bundle);
  try {
    const status=await lstat(root);
    if(!status.isDirectory() || status.isSymbolicLink()) throw new Error('Installation directory must not be a symlink.');
    await access(join(root,'installed.json'));
  } catch(error) {
    if(error.code!=='ENOENT') throw error;
    // A pre-existing unmarked folder is never adopted/overwritten.
    try {await lstat(root);throw new Error('Destination exists without an OmniRoute installation marker.');}
    catch(check) {if(check.code!=='ENOENT') throw check;}
  }
  await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
  const versions=join(root,'versions');await mkdir(versions,{mode:0o700});
  const stage=await mkdtemp(join(versions,`${manifest.version}-`));
  // Copy only verified files. Existing versions and all user data are retained.
  for(const entry of manifest.files) {
    const dest=join(stage,entry.path);await mkdir(resolve(dest,'..'),{recursive:true,mode:0o700});
    await copyFile(join(bundle,'payload',entry.path),dest);
    await chmod(dest,entry.path==='node/node'||entry.path==='opencode/opencode'?0o700:0o600);
  }
  const link=join(root,`.current-${randomUUID()}`);
  await symlink(relative(root,stage),link,'dir');await rename(link,join(root,'current'));
  for(const name of ['Launch.sh','Settings.sh']) {await copyFile(join(stage,name),join(root,name));await chmod(join(root,name),0o700);}
  await writeFile(join(root,'installed.json'),JSON.stringify({version:manifest.version,platform:manifest.platform})+'\n',{mode:0o600});
  return root;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.platform!=='linux' || process.arch!=='x64' || process.getuid?.()===0) throw new Error('Use a normal user on Linux x64.');
    process.umask(0o077);
    const bundle=resolve(process.argv[2]);
    const dataHome=process.env.XDG_DATA_HOME && isAbsolute(process.env.XDG_DATA_HOME)?process.env.XDG_DATA_HOME:join(homedir(),'.local/share');
    const root=join(dataHome,'OmniRouteRegular');
    // Check prerequisites without storing any secret or requesting credentials.
    await new Promise((res,rej)=>{const p=spawn('secret-tool',['lookup','--help'],{stdio:'ignore'});p.once('error',()=>rej(new Error('Install libsecret-tools and a desktop Secret Service keyring first (see README).')));p.once('exit',code=>code===0?res():rej(new Error('secret-tool is unavailable.')));});
    await installLinux(bundle,root);
    console.log(`Installed to ${root}\nLaunch: sh "${join(root,'Launch.sh')}"\nKeys: sh "${join(root,'Settings.sh')}"`);
    if(!process.argv.includes('--no-wizard')) {
      process.exitCode=await new Promise((res,rej)=>{const p=spawn('sh',[join(root,'Settings.sh')],{stdio:'inherit'});p.once('error',rej);p.once('exit',code=>res(code??1));});
    }
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
