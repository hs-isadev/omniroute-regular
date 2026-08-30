// Recompute a generated payload manifest and ZIP after a maintainer changes
// staged build outputs. Does not import personal runtime data or edit source.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join, relative, dirname, basename } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const release=join(root,'release',`OmniRoute-Regular-${version}-windows-x64`),payload=join(release,'payload');
const files=[];
async function walk(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name),rel=relative(payload,path).replaceAll('\\','/');
    if(entry.isSymbolicLink()) throw Error('No symlinks allowed in portable payload');
    if(entry.isDirectory()) {
      if(/(^|\/)(data|logs|backups|state)$/.test(rel)) throw Error(`Unexpected runtime folder: ${rel}`);
      await walk(path);
    } else {
      if(/vault\.json$|credentials\.txt$|auth\.json$|\.log$/.test(rel)) throw Error(`Forbidden runtime file: ${rel}`);
      files.push({path:rel,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
    }
  }
}
await walk(payload);files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(join(release,'manifest.json'),JSON.stringify({version,node:'22.23.2',opencode:'1.18.25',files},null,2)+'\n');
await new Promise((res,rej)=>{
  const child=spawn('tar.exe',['-a','-cf',release+'.zip','-C',dirname(release),basename(release)],{windowsHide:true,stdio:'inherit'});
  child.once('error',rej);child.once('exit',code=>code===0?res():rej(Error(`ZIP failed: ${code}`)));
});
const hash=createHash('sha256').update(await readFile(release+'.zip')).digest('hex');
await writeFile(release+'.zip.sha256',`${hash}  ${basename(release)}.zip\n`);
console.log(`Sealed ${files.length} payload files: ${basename(release)}.zip`);
