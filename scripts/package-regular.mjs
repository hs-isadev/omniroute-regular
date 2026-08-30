import { mkdir, mkdtemp, cp, readdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join, relative } from 'node:path';

if(process.platform!=='win32') throw new Error('Build the Windows package on Windows.');
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const cache=join(root,'.cache'); await mkdir(cache,{recursive:true});
await mkdir(join(root,'.build'),{recursive:true});
const work=await mkdtemp(join(root,'.build','regular-'));
const release=join(root,'release',`OmniRoute-Regular-${version}-windows-x64`);
try {await access(release); throw new Error('Release folder already exists. Preserve or move it before rebuilding.');} catch(e) {if(e.code!=='ENOENT') throw e;}
const payload=join(release,'payload'); await mkdir(payload,{recursive:true});
const ps=(s)=>"'"+s.replaceAll("'","''")+"'";
async function run(command,args,cwd=root) {
  await new Promise((res,rej)=>{const child=spawn(command,args,{cwd,stdio:'inherit',windowsHide:true});child.on('error',rej);child.on('exit',c=>c===0?res():rej(new Error(`${command} exited ${c}`)));});
}
async function download(url,name,algorithm,expected,encoding='hex') {
  const path=join(cache,name);
  let bytes;
  try {bytes=await readFile(path);} catch(e) {
    if(e.code!=='ENOENT') throw e;
    console.log(`Downloading ${name}`);
    const response=await fetch(url,{signal:AbortSignal.timeout(300000)});
    if(!response.ok) throw new Error(`Download failed: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
  }
  if(createHash(algorithm).update(bytes).digest(encoding)!==expected) throw new Error(`Integrity check failed: ${name}`);
  await writeFile(path,bytes); return path;
}
const nodeZip=await download('https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip','node-v22.23.2-win-x64.zip','sha256','1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97');
await run('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath ${ps(nodeZip)} -DestinationPath ${ps(work)}`]);
await mkdir(join(payload,'node'));
for(const name of ['node.exe','LICENSE']) await cp(join(work,'node-v22.23.2-win-x64',name),join(payload,'node',name));
const openCode=await download('https://registry.npmjs.org/opencode-windows-x64/-/opencode-windows-x64-1.18.25.tgz','opencode-windows-x64-1.18.25.tgz','sha512','xW5wtSxWYbI7DcmQWMlNWIiDBdMJON1vDiEmVWo88R9tT/PaahOhWKgp7FoWDqJKf89jS3ZIzkqnkU3F2dio7A==','base64');
const extraction=join(work,'opencode'); await mkdir(extraction);
await run('tar.exe',['-xzf',openCode,'-C',extraction]);
await mkdir(join(payload,'opencode'));
await cp(join(extraction,'package/bin/opencode.exe'),join(payload,'opencode/opencode.exe'));
await cp(join(root,'distribution/OPENCODE-LICENSE.txt'),join(payload,'opencode/LICENSE.txt'));
// Build a production-only workspace, then dereference npm workspace junctions.
const appStage=join(work,'app'); await mkdir(appStage);
for(const name of ['package.json','package-lock.json','LICENSE']) await cp(join(root,name),join(appStage,name));
for(const group of ['apps','packages']) {
  for(const entry of await readdir(join(root,group),{withFileTypes:true})) {
    if(!entry.isDirectory()) continue;
    const src=join(root,group,entry.name), dst=join(appStage,group,entry.name);
    try {await access(join(src,'package.json'));} catch {continue;}
    await mkdir(dst,{recursive:true}); await cp(join(src,'package.json'),join(dst,'package.json'));
    try {await cp(join(src,'dist'),join(dst,'dist'),{recursive:true});} catch(e) {if(e.code!=='ENOENT') throw e;}
  }
}
const npmCli=join(work,'node-v22.23.2-win-x64/node_modules/npm/bin/npm-cli.js');
await run(join(payload,'node/node.exe'),[npmCli,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],appStage);
await cp(appStage,join(payload,'app'),{recursive:true,dereference:true});
await mkdir(join(payload,'app/distribution'),{recursive:true});
for(const name of ['launch.mjs','settings.mjs','skills']) await cp(join(root,'distribution',name),join(payload,'app/distribution',name),{recursive:true});
await mkdir(join(payload,'app/docs/integrations'),{recursive:true});
await cp(join(root,'docs/integrations/opencode-regular-instructions.md'),join(payload,'app/docs/integrations/opencode-regular-instructions.md'));
for(const name of ['Settings.ps1','Settings.cmd','Launch.cmd']) await cp(join(root,'distribution',name),join(payload,name));
for(const name of ['Setup.ps1','Setup.cmd']) await cp(join(root,'distribution',name),join(release,name));
await cp(join(root,'README.md'),join(release,'README.md'));
await mkdir(join(release,'docs'),{recursive:true});
await cp(join(root,'docs/free-provider-expansion.md'),join(release,'docs/free-provider-expansion.md'));
const files=[];
async function walk(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isSymbolicLink()) throw new Error('Portable payload contains a symlink');
    if(entry.isDirectory()) await walk(path);
    else {
      const rel=relative(payload,path).replaceAll('\\','/');
      if(/(^|\/)(data|logs|vault|backups|state)\//.test(rel) && !rel.startsWith('app/packages/vault/') && !rel.startsWith('app/node_modules/@omniroute/vault/')) throw new Error(`Unexpected runtime path: ${rel}`);
      if(/vault\.json$|credentials\.txt$|auth\.json$|\.log$/.test(rel)) throw new Error(`Forbidden personal data: ${rel}`);
      files.push({path:rel,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
    }
  }
}
await walk(payload); files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(join(release,'manifest.json'),JSON.stringify({version,node:'22.23.2',opencode:'1.18.25',files},null,2)+'\n');
console.log('Compressing portable package...');
await run('tar.exe',['-a','-cf',release+'.zip','-C',join(root,'release'),relative(join(root,'release'),release)]);
const digest=createHash('sha256').update(await readFile(release+'.zip')).digest('hex');
await writeFile(release+'.zip.sha256',`${digest}  ${relative(join(root,'release'),release)}.zip\n`);
console.log(`Built ${release}.zip (${files.length} checked files)`);
