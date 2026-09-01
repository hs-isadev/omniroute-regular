import {access,readFile,writeFile,readdir,mkdir,cp,mkdtemp,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {join,resolve,relative,basename,dirname} from 'node:path';
import {verifyPackage} from '../distribution/install.mjs';
const repo=resolve(import.meta.dirname,'..'),version='0.4.0';
const release=join(repo,'release','OmniRoute-Dual-'+version);
try{await access(release);throw new Error('Release folder exists; preserve it before making a new preview.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(release,{recursive:true});
const work=await mkdtemp(join(repo,'.build','dual-'));
async function run(cmd,args){await new Promise((res,rej)=>{const child=spawn(cmd,args,{stdio:'inherit',windowsHide:true});child.once('error',rej);child.once('exit',code=>code===0?res():rej(new Error(cmd+' failed '+code)));});}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const integrity={
  'windows-x64':'xW5wtSxWYbI7DcmQWMlNWIiDBdMJON1vDiEmVWo88R9tT/PaahOhWKgp7FoWDqJKf89jS3ZIzkqnkU3F2dio7A==',
  'linux-x64':'bdRSJ6gbK/EnLNWxROOQYXFXiUeqeFxGz8DIO8LCqnii99A2OWFAyZ3Da5gpvfT1Yrp9/lYL55n/tM3ale5smg=='
};
for(const [platform,label] of [['windows-x64','Windows'],['linux-x64','Linux']]){
  const source=join(repo,'release','OmniRoute-Regular-0.2.2-'+platform);
  await verifyPackage(source,platform);
  const target=join(release,label),payload=join(target,'payload');await mkdir(target);
  console.log('Copying verified '+platform+' production payload');
  await cp(join(source,'payload'),payload,{recursive:true,errorOnExist:true,force:false});
  for(const name of ['config','contracts','core','integrations','mcp-server','observability','providers'])await cp(join(repo,'packages',name,'dist'),join(payload,'app/packages',name,'dist'),{recursive:true,force:true});
  for(const name of ['dual-chat.mjs','dual-setup.mjs','gui-keys.mjs','settings-gui.py','Settings.ps1','settings.mjs','key-editor.mjs'])await cp(join(repo,'distribution',name),join(payload,'app/distribution',name));
  await cp(join(repo,'distribution/dual'),join(payload,'app/distribution/dual'),{recursive:true});
  const windows=platform==='windows-x64';
  const wrappers=windows?['Launch.ps1','Launch.cmd','Connect.ps1','Connect.cmd']:['Launch.sh','Connect.sh'];
  for(const name of wrappers)await cp(join(repo,'distribution/dual',name),join(payload,name));
  for(const name of windows?['Setup.ps1','Setup.cmd']:['Setup.sh'])await cp(join(repo,'distribution/dual',name),join(target,name));
  const archive=join(repo,'.cache','opencode-'+platform+'-1.18.25.tgz');
  if(createHash('sha512').update(await readFile(archive)).digest('base64')!==integrity[platform])throw new Error('OpenCode official npm checksum mismatch');
  const extracted=join(work,platform);await mkdir(extracted);
  await run(process.platform==='win32'?'tar.exe':'tar',['-xzf',archive,'-C',extracted]);
  await mkdir(join(payload,'opencode'));
  await cp(join(extracted,'package/bin',windows?'opencode.exe':'opencode'),join(payload,'opencode',windows?'opencode.exe':'opencode'));
  await cp(join(repo,'distribution/OPENCODE-LICENSE.txt'),join(payload,'opencode/LICENSE.txt'));
  await cp(join(repo,'THIRD-PARTY-NOTICES.md'),join(payload,'app/THIRD-PARTY-NOTICES.md'));
  if(!windows)await chmod(join(payload,'opencode/opencode'),0o755);
  await writeFile(join(payload,'dual-provenance.json'),JSON.stringify({version,hosts:['opencode','antigravity','codex','claude-code'],status:'local-shareable-package',node:'22.23.2',opencode:'1.18.25',opencodeIntegrity:'sha512-'+integrity[platform],personalDataIncluded:false,sourceBaseline:'OmniRoute Regular 0.2.2 plus four-host, graphical setup, strict-free provider, and usage-accounting modules',antigravity:'Downloaded directly from Google during setup; not redistributed',codex:'Uses an existing user installation; not redistributed',claudeCode:'Uses an existing user installation; not redistributed'},null,2)+'\n');
  const files=[];
  async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,item.name),rel=relative(payload,path).replaceAll('\\','/');
    if(item.isSymbolicLink())throw new Error('No symlinks allowed in payload');
    if(item.isDirectory())await walk(path);else{
      if(/(?:^|\/)(?:credentials[^/]*\.txt|vault\.json|auth\.json|\.env(?:\..*)?|.*\.log)$/.test(rel))throw new Error('Personal/credential file rejected: '+rel);
      files.push({path:rel,sha256:hash(await readFile(path))});
    }
  }}
  await walk(payload);files.sort((a,b)=>a.path.localeCompare(b.path));
  await writeFile(join(target,'manifest.json'),JSON.stringify({version,platform,host:'multi',hosts:['opencode','antigravity','codex','claude-code'],files},null,2)+'\n');
  await verifyPackage(target,platform);console.log('Verified '+label+': '+files.length+' payload files');
}
await cp(join(repo,'distribution/dual/README.md'),join(release,'README.md'));
await cp(join(repo,'THIRD-PARTY-NOTICES.md'),join(release,'THIRD-PARTY-NOTICES.md'));
await cp(join(repo,'distribution/dual/Install-Windows.cmd'),join(release,'Install-Windows.cmd'));
await cp(join(repo,'distribution/dual/Install-Linux.sh'),join(release,'Install-Linux.sh'));
await writeFile(join(release,'LOCAL-PACKAGE.txt'),'Shareable local package. No API keys or account sessions are included. Z.AI remains available despite owner-account rate limits/timeouts; this is not a claim all providers work for every account. GitHub publication is a separate action.\n');
console.log('Staged combined package: '+release);
console.log('Run tests and create VERIFICATION.md before sealing a download archive.');
