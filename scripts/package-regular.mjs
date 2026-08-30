import { mkdir, mkdtemp, cp, readdir, readFile, writeFile, access, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join, relative } from 'node:path';

if(!['win32','linux'].includes(process.platform) || process.arch!=='x64') throw new Error('Build on Windows or Linux x64.');
const linux=process.platform==='linux';
const platform=linux?'linux-x64':'windows-x64';
const tar=linux?'tar':'tar.exe';
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const cache=join(root,'.cache'); await mkdir(cache,{recursive:true});
await mkdir(join(root,'.build'),{recursive:true});
const work=await mkdtemp(join(root,'.build','regular-'));
const release=join(root,'release',`OmniRoute-Regular-${version}-${platform}`);
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
const nodeFolder=linux?'node-v22.23.2-linux-x64':'node-v22.23.2-win-x64';
const nodeArchive=nodeFolder+(linux?'.tar.xz':'.zip');
const nodeZip=await download(`https://nodejs.org/dist/v22.23.2/${nodeArchive}`,nodeArchive,'sha256',linux?'d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307':'1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97');
if(linux) await run(tar,['-xJf',nodeZip,'-C',work]);
else await run('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath ${ps(nodeZip)} -DestinationPath ${ps(work)}`]);
await mkdir(join(payload,'node'));
await cp(join(work,nodeFolder,linux?'bin/node':'node.exe'),join(payload,'node',linux?'node':'node.exe'));
await cp(join(work,nodeFolder,'LICENSE'),join(payload,'node/LICENSE'));
const openCodePackage=linux?'opencode-linux-x64':'opencode-windows-x64';
const openCode=await download(`https://registry.npmjs.org/${openCodePackage}/-/${openCodePackage}-1.18.25.tgz`,`${openCodePackage}-1.18.25.tgz`,'sha512',linux?'bdRSJ6gbK/EnLNWxROOQYXFXiUeqeFxGz8DIO8LCqnii99A2OWFAyZ3Da5gpvfT1Yrp9/lYL55n/tM3ale5smg==':'xW5wtSxWYbI7DcmQWMlNWIiDBdMJON1vDiEmVWo88R9tT/PaahOhWKgp7FoWDqJKf89jS3ZIzkqnkU3F2dio7A==','base64');
const extraction=join(work,'opencode'); await mkdir(extraction);
await run(tar,['-xzf',openCode,'-C',extraction]);
await mkdir(join(payload,'opencode'));
await cp(join(extraction,'package/bin',linux?'opencode':'opencode.exe'),join(payload,'opencode',linux?'opencode':'opencode.exe'));
if(linux) for(const path of ['node/node','opencode/opencode']) await chmod(join(payload,path),0o755);
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
const npmCli=join(work,nodeFolder,linux?'lib/node_modules/npm/bin/npm-cli.js':'node_modules/npm/bin/npm-cli.js');
await run(join(payload,'node',linux?'node':'node.exe'),[npmCli,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],appStage);
await cp(appStage,join(payload,'app'),{recursive:true,dereference:true});
await mkdir(join(payload,'app/distribution'),{recursive:true});
for(const name of ['launch.mjs','settings.mjs','skills']) await cp(join(root,'distribution',name),join(payload,'app/distribution',name),{recursive:true});
if(linux) for(const name of ['settings-linux.mjs','install-linux.mjs']) await cp(join(root,'distribution',name),join(payload,'app/distribution',name));
await mkdir(join(payload,'app/docs/integrations'),{recursive:true});
await cp(join(root,'docs/integrations/opencode-regular-instructions.md'),join(payload,'app/docs/integrations/opencode-regular-instructions.md'));
for(const name of linux?['Settings.sh','Launch.sh']:['Settings.ps1','Settings.cmd','Launch.cmd']) await cp(join(root,'distribution',name),join(payload,name));
for(const name of linux?['Setup.sh']:['Setup.ps1','Setup.cmd']) await cp(join(root,'distribution',name),join(release,name));
if(linux) for(const path of [join(release,'Setup.sh'),join(payload,'Settings.sh'),join(payload,'Launch.sh')]) await chmod(path,0o755);
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
await writeFile(join(release,'manifest.json'),JSON.stringify({version,platform,node:'22.23.2',opencode:'1.18.25',files},null,2)+'\n');
console.log('Compressing portable package...');
const extension=linux?'.tar.gz':'.zip';
await run(tar,[...(linux?['-czf']:['-a','-cf']),release+extension,'-C',join(root,'release'),relative(join(root,'release'),release)]);
const digest=createHash('sha256').update(await readFile(release+extension)).digest('hex');
await writeFile(release+extension+'.sha256',`${digest}  ${relative(join(root,'release'),release)}${extension}\n`);
console.log(`Built ${release}${extension} (${files.length} checked files)`);
