import {access,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {verifyPackage} from '../distribution/install.mjs';
const repo=resolve(import.meta.dirname,'..'),release=join(repo,'release/OmniRoute-Dual-0.5.0-experiment');
try{await access(release+'.zip');throw new Error('Do not change a sealed release');}catch(e){if(e.code!=='ENOENT')throw e;}
for(const [label,platform] of [['Windows','windows-x64'],['Linux','linux-x64']]){
  const dir=join(release,label);await verifyPackage(dir,platform);
  const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
  for(const name of ['dual-chat.mjs','dual-setup.mjs','Settings.ps1','settings-gui.py','dual/README.md']){
    const target='app/distribution/'+name;
    await copyFile(join(repo,'distribution',name),join(dir,'payload',target));
    manifest.files.find(f=>f.path===target).sha256=createHash('sha256').update(await readFile(join(dir,'payload',target))).digest('hex');
  }
  await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await verifyPackage(dir,platform);
}
await copyFile(join(repo,'distribution/dual/README.md'),join(release,'README.md'));
console.log('Unsealed code overlays and both manifests verified.');
