import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {join,resolve,basename,dirname} from 'node:path';
import {verifyPackage} from '../distribution/install.mjs';

const release=resolve(import.meta.dirname,'../release/OmniRoute-0.6.9');
await access(join(release,'VERIFICATION.md'));
for(const [label,platform] of [['Windows','windows-x64'],['Linux','linux-x64']])await verifyPackage(join(release,label),platform);
const archive=release+'.zip';try{await access(archive);throw new Error('Archive already exists; never silently overwrite a verified package.');}catch(error){if(error.code!=='ENOENT')throw error;}
await new Promise((resolvePromise,reject)=>{const child=spawn(process.platform==='win32'?'tar.exe':'tar',['-a','-cf',archive,'-C',dirname(release),basename(release)],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolvePromise():reject(new Error('Archive failed')));});
const digest=createHash('sha256').update(await readFile(archive)).digest('hex');await writeFile(archive+'.sha256',`${digest}  ${basename(archive)}\n`);
console.log(archive);console.log(`SHA256 ${digest}`);console.log('Windows/Linux archive created. Verify the adjacent SHA-256 file before distribution.');
