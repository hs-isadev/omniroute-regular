import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, access} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const launcher=fileURLToPath(new URL('../../Open-OmniRoute-Keys.ps1',import.meta.url));
test('simple GUI contains masked shortlisted provider fields without opening a window',{skip:process.platform!=='win32'},async()=>{
  const ui=fileURLToPath(new URL('./Settings.ps1',import.meta.url));
  const {stdout}=await run('powershell.exe',['-NoProfile','-STA','-NonInteractive','-ExecutionPolicy','Bypass','-File',ui,'-Simple','-SmokeTest'],{timeout:15000,windowsHide:true});
  assert.match(stdout,/PASS: masked Windows Forms/);
  assert.match(stdout,/13 masked/);
});
for(const marker of [null,'versions/missing','../../invalid']) test('key launcher preflight does not require installation marker: '+marker,{skip:process.platform!=='win32'||!existsSync(launcher)},async()=>{
  const local=await mkdtemp(join(tmpdir(),'omni-launcher-'));
  const root=join(local,'OmniRouteRegular');
  if(marker!==null){await mkdir(root);await writeFile(join(root,'active-version.txt'),marker);}
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',launcher,'-CheckOnly'],{env:{...process.env,LOCALAPPDATA:local},timeout:15000,windowsHide:true});
  const result=JSON.parse(stdout.trim());
  assert.equal(result.ready,true);assert.equal(result.profile,root);assert.match(result.node,/node\.exe$/i);
  assert.match(result.editor,/Settings\.ps1$/i);
  await assert.rejects(access(join(root,'data')));
  if(marker!==null)assert.equal(await readFile(join(root,'active-version.txt'),'utf8'),marker);
});
