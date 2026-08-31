// Documentation-only finalization after extracted-runtime tests. Payload bytes
// and manifest are verified and never changed; archive checksums are refreshed.
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve, basename } from 'node:path';
import { verifyPackage } from '../distribution/install.mjs';
const root=resolve(import.meta.dirname,'..'),version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
for(const platform of ['windows-x64','linux-x64']) {
  const bundle=join(root,'release','OmniRoute-Regular-'+version+'-'+platform);
  const before=await readFile(join(bundle,'manifest.json'));await verifyPackage(bundle,platform);
  await mkdir(join(bundle,'docs/testing'),{recursive:true});await mkdir(join(bundle,'plans'),{recursive:true});
  for(const path of ['README.md','docs/antigravity-regular.md','docs/free-provider-expansion.md','docs/testing/antigravity-regular.tdd.md','docs/testing/guided-setup.tdd.md','plans/antigravity-regular.md']) await cp(join(root,path),join(bundle,path));
  const linux=platform==='linux-x64',archive=bundle+(linux?'.tar.gz':'.zip');
  await new Promise((res,rej)=>{const p=spawn(process.platform==='win32'?'tar.exe':'tar',[...(linux?['-czf']:['-a','-cf']),archive,'-C',join(root,'release'),basename(bundle)],{stdio:'inherit',windowsHide:true});p.once('error',rej);p.once('exit',c=>c===0?res():rej(Error('Archive failed')));});
  if(!(await readFile(join(bundle,'manifest.json'))).equals(before))throw Error('Runtime manifest changed during documentation finalization');
  const digest=createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(archive+'.sha256',digest+'  '+basename(archive)+'\n');
  console.log(platform+': unchanged verified payload; documentation and archive checksum finalized.');
}
