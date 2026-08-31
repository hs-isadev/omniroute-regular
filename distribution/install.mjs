import { access, chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const platform=()=>process.platform==='win32'?'windows-x64':'linux-x64';
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const wrappers=['Launch.cmd','Launch.ps1','Launch.sh','Settings.cmd','Settings.ps1','Settings.sh','Manage.cmd','Manage.ps1','Manage.sh','Connect.cmd','Connect.ps1','Connect.sh'];
async function noLinks(path) {
  for(let p=resolve(path);;p=dirname(p)) {
    try {if((await lstat(p)).isSymbolicLink()) throw new Error('Symlink/reparse installation paths are not supported.');}
    catch(error) {if(error.code!=='ENOENT') throw error;}
    if(p===dirname(p)) break;
  }
}
async function atomic(path,text) {
  await noLinks(path);const temp=path+'.tmp-'+randomUUID();
  await writeFile(temp,text,{flag:'wx',mode:0o600});await rename(temp,path);
}
function validRelative(path) {
  return typeof path==='string'&&!/[\\:\x00-\x1f]/.test(path)&&!isAbsolute(path)&&path.split('/').every(p=>p&&p!=='.'&&p!=='..');
}
export async function verifyPackage(bundle,expectedPlatform=platform()) {
  await noLinks(bundle);
  const manifest=await json(join(bundle,'manifest.json')),payload=join(bundle,'payload');
  if(manifest.platform!==expectedPlatform||manifest.host!=='antigravity'||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)||!Array.isArray(manifest.files)||!manifest.files.length) throw new Error('Invalid package platform/version/host manifest.');
  const expected=new Map();
  for(const entry of manifest.files) {
    if(!validRelative(entry.path)||! /^[a-f0-9]{64}$/.test(entry.sha256)||expected.has(entry.path.toLowerCase())) throw new Error('Unsafe or duplicate manifest path.');
    expected.set(entry.path.toLowerCase(),entry.sha256);
  }
  const seen=new Set();
  async function walk(dir) {
    await noLinks(dir);
    for(const item of await readdir(dir,{withFileTypes:true})) {
      const path=join(dir,item.name),name=relative(payload,path).replaceAll('\\','/').toLowerCase();
      if(item.isSymbolicLink()) throw new Error('Package contains a symlink/reparse point.');
      if(item.isDirectory()) await walk(path);
      else if(item.isFile()) {
        if(!expected.has(name)||hash(await readFile(path))!==expected.get(name)||seen.has(name)) throw new Error('Package checksum failed or unexpected file: '+name);
        seen.add(name);
      } else throw new Error('Package contains a special file.');
    }
  }
  await walk(payload);
  if(seen.size!==expected.size) throw new Error('Package is incomplete.');
  return manifest;
}
function validateRoot(root) {
  if(!isAbsolute(root)||resolve(root)===resolve('/')||resolve(root)===resolve(homedir())||/[\r\n\0]/.test(root)) throw new Error('Unsafe installation root.');
}
async function verifyInstalled(stage,manifest) {
  await noLinks(stage);
  for(const entry of manifest.files) {
    if(!validRelative(entry.path))throw new Error('Unsafe installed manifest');
    const path=join(stage,entry.path);await noLinks(path);
    if(hash(await readFile(path))!==entry.sha256) throw new Error('Installed payload checksum failed: '+entry.path);
  }
}
async function checkLaunchers(root,marker) {
  for(const [name,digest] of Object.entries(marker?.launcherHashes??{})) {
    if(!wrappers.includes(name)) throw new Error('Invalid launcher ownership record.');
    await noLinks(join(root,name));
    if(hash(await readFile(join(root,name)))!==digest) throw new Error('User-modified launcher retained; manual migration required.');
  }
}
export async function installPackage(bundle,root) {
  validateRoot(root);await noLinks(root);
  const manifest=await verifyPackage(bundle);
  let old=null;
  try {await access(root);old=await json(join(root,'installed.json'));if(!old.version) throw new Error('Invalid installation marker.');}
  catch(error) {if(error.code!=='ENOENT') throw error;try {await access(root);throw new Error('Destination is unmarked; choose a new installation directory.');}catch(check){if(check.code!=='ENOENT') throw check;}}
  await mkdir(root,{recursive:true,mode:0o700});
  const lock=join(root,'.install-lock');await mkdir(lock,{mode:0o700}).catch(()=>{throw new Error('Installation busy or stale .install-lock; no files replaced.');});
  try {
    const id=manifest.version+'-'+hash(JSON.stringify(manifest)).slice(0,12),active='versions/'+id;
    const versions=join(root,'versions');await noLinks(versions);await mkdir(versions,{recursive:true,mode:0o700});
    const stage=join(versions,id);
    await checkLaunchers(root,old);
    if(old?.active===active) {await verifyInstalled(stage,manifest);return {root,version:manifest.version,changed:false};}
    // Refuse to reuse an incomplete prior stage; it remains available for inspection.
    await mkdir(stage,{mode:0o700});
    for(const entry of manifest.files) {
      const source=join(bundle,'payload',entry.path),dest=join(stage,entry.path);
      await noLinks(source);await mkdir(dirname(dest),{recursive:true,mode:0o700});
      await copyFile(source,dest);
      if(hash(await readFile(dest))!==entry.sha256) throw new Error('Payload changed while copying; active version was not changed.');
      if(process.platform!=='win32') await chmod(dest,entry.path==='node/node'||entry.path.endsWith('.sh')?0o700:0o600);
    }
    await writeFile(join(stage,'package-manifest.json'),JSON.stringify(manifest),{mode:0o600});
    // Back up root launchers (including v0.1.x) before installing owned wrappers.
    const backup=join(root,'installer-backups',randomUUID());await mkdir(backup,{recursive:true,mode:0o700});
    const launcherHashes={},undo=[];
    try {
    for(const name of wrappers.filter(name=>manifest.files.some(file=>file.path===name))) {
      const dest=join(root,name);await noLinks(dest);
      let previous=null;try {previous=await readFile(dest);await copyFile(dest,join(backup,name));}catch(error){if(error.code!=='ENOENT')throw error;}
      const bytes=await readFile(join(stage,name));await atomic(dest,bytes);undo.push({dest,previous,written:bytes});launcherHashes[name]=hash(bytes);
      if(process.platform!=='win32'&&name.endsWith('.sh')) await chmod(dest,0o700);
    }
    if(old) await writeFile(join(backup,'installed.json'),JSON.stringify(old),{mode:0o600});
    const marker={version:manifest.version,platform:manifest.platform,host:'antigravity',active,previous:old?.active??null,launcherHashes,backup};
    for(const [name,text] of [['active-version.txt',active+'\n'],['installed.json',JSON.stringify(marker,null,2)+'\n']]) {
      const dest=join(root,name);let previous=null;try {previous=await readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
      const written=Buffer.from(text);await atomic(dest,written);undo.push({dest,previous,written});
    }
    return {root,version:manifest.version,changed:true,backup};
    } catch(error) {
      for(const item of undo.reverse()) {
        if(hash(await readFile(item.dest))!==hash(item.written)) continue;
        if(item.previous===null)await unlink(item.dest);else await atomic(item.dest,item.previous);
      }
      throw error;
    }
  } finally {await rmdir(lock);}
}
export async function rollbackPackage(root) {
  validateRoot(root);await noLinks(root);
  const marker=await json(join(root,'installed.json'));
  if(!marker.previous||!/^versions\/[a-zA-Z0-9.-]+$/.test(marker.previous)) throw new Error('No previous version is available. Legacy launchers are in installer-backups.');
  await noLinks(join(root,marker.previous));
  const manifest=await json(join(root,marker.previous,'package-manifest.json'));
  for(const entry of manifest.files) {if(!validRelative(entry.path))throw new Error('Unsafe rollback manifest');await noLinks(join(root,marker.previous,entry.path));if(hash(await readFile(join(root,marker.previous,entry.path)))!==entry.sha256)throw new Error('Rollback payload checksum failed');}
  const current=marker.active;marker.active=marker.previous;marker.previous=current;marker.version=manifest.version;
  await atomic(join(root,'active-version.txt'),marker.active+'\n');await atomic(join(root,'installed.json'),JSON.stringify(marker,null,2)+'\n');
  return {root,version:marker.version};
}
export async function uninstallPackage(root) {
  validateRoot(root);await noLinks(root);const marker=await json(join(root,'installed.json'));
  // Recoverable uninstall: detach launchers; retain binaries and all user data.
  const retired=join(root,'uninstalled-'+randomUUID());await mkdir(retired,{mode:0o700});
  for(const [name,digest] of Object.entries(marker.launcherHashes??{})) {
    if(!wrappers.includes(name)) throw new Error('Invalid launcher ownership record.');
    await noLinks(join(root,name));
    if(hash(await readFile(join(root,name)))!==digest) throw new Error('User-modified launcher retained; manual uninstall required.');
  }
  for(const name of Object.keys(marker.launcherHashes??{})) await rename(join(root,name),join(retired,name));
  await rename(join(root,'installed.json'),join(retired,'installed.json'));
  await rename(join(root,'active-version.txt'),join(retired,'active-version.txt'));
  return {root,retired,retained:'All data, versions and workspace integrations. Detach each workspace with Manage before uninstall.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(!['win32','linux'].includes(process.platform)||process.arch!=='x64'||process.getuid?.()===0) throw new Error('Run as a normal user on Windows or Linux x64.');
    const [action,source,target]=process.argv.slice(2);
    const result=action==='install'?await installPackage(resolve(source),resolve(target)):action==='rollback'?await rollbackPackage(resolve(source)):action==='uninstall'?await uninstallPackage(resolve(source)):null;
    if(!result)throw new Error('Expected install BUNDLE ROOT, rollback ROOT, or uninstall ROOT.');
    console.log(JSON.stringify(result));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
