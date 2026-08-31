import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { installPackage, rollbackPackage, verifyPackage } from './install.mjs';

async function fixture(version='0.2.0') {
  const root=await mkdtemp(join(tmpdir(),'omni-install-v2-')),bundle=join(root,'bundle');
  await mkdir(join(bundle,'payload'),{recursive:true});
  const platform=process.platform==='win32'?'windows-x64':'linux-x64';
  const files=[];
  for(const [path,content] of Object.entries({'app/version.txt':version,'Launch.cmd':'fixture launcher','Launch.sh':'#!/bin/sh\n','Settings.cmd':'fixture settings','Settings.sh':'#!/bin/sh\n'})) {
    await mkdir(join(bundle,'payload',path,'..'),{recursive:true});await writeFile(join(bundle,'payload',path),content);
    files.push({path,sha256:createHash('sha256').update(content).digest('hex')});
  }
  await writeFile(join(bundle,'manifest.json'),JSON.stringify({version,platform,host:'antigravity',files}));
  return {root,bundle,install:join(root,'Install With Spaces')};
}

test('versioned installs are idempotent, preserve data and rollback safely',async()=>{
  const f=await fixture();await installPackage(f.bundle,f.install);
  await mkdir(join(f.install,'data'));await writeFile(join(f.install,'data/user-data'),'keep');
  const initial=await readFile(join(f.install,'active-version.txt'),'utf8');
  await installPackage(f.bundle,f.install);
  assert.equal(await readFile(join(f.install,'active-version.txt'),'utf8'),initial);
  assert.equal((await readdir(join(f.install,'versions'))).length,1);
  const next=await fixture('0.2.1');await installPackage(next.bundle,f.install);
  assert.notEqual(await readFile(join(f.install,'active-version.txt'),'utf8'),initial);
  await rollbackPackage(f.install);
  assert.equal(await readFile(join(f.install,'active-version.txt'),'utf8'),initial);
  assert.equal(await readFile(join(f.install,'data/user-data'),'utf8'),'keep');
});
test('installer rejects unmarked destinations, unsafe manifests and extra files',async()=>{
  const f=await fixture();await mkdir(f.install);
  await assert.rejects(installPackage(f.bundle,f.install),/unmarked|marker/i);
  await writeFile(join(f.bundle,'payload','extra'),'unexpected');await assert.rejects(verifyPackage(f.bundle),/checksum|unexpected/i);
  const manifest=JSON.parse(await readFile(join(f.bundle,'manifest.json')));manifest.files[0].path='../escape';
  await writeFile(join(f.bundle,'manifest.json'),JSON.stringify(manifest));await assert.rejects(verifyPackage(f.bundle),/unsafe/i);
});
test('reinstall detects installed payload tampering and upgrade preserves edited launchers',async()=>{
  const f=await fixture();await installPackage(f.bundle,f.install);
  const active=(await readFile(join(f.install,'active-version.txt'),'utf8')).trim();
  await writeFile(join(f.install,active,'app/version.txt'),'tampered');
  await assert.rejects(installPackage(f.bundle,f.install),/checksum/i);
  await writeFile(join(f.install,'Launch.cmd'),'user-edited');
  const next=await fixture('0.2.1');
  await assert.rejects(installPackage(next.bundle,f.install),/modified/i);
  assert.equal(await readFile(join(f.install,'Launch.cmd'),'utf8'),'user-edited');
});
