import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hiddenPrompt } from './settings-linux.mjs';
import { verifyPayload, installLinux } from './install-linux.mjs';
import { SecretServiceProtector, defaultKeyProtector } from '../packages/vault/dist/index.js';
import { openCodeHarnessEnvironment } from '../apps/cli/dist/harness-env.js';

test('Linux MCP keeps the desktop bus but not provider secrets',()=>{
  const env=openCodeHarnessEnvironment({DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus',XDG_RUNTIME_DIR:'/run/user/1000',GROQ_API_KEY:'fixture-secret'},'/fixture','session-token','{}');
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS,'unix:path=/run/user/1000/bus');assert.equal(env.XDG_RUNTIME_DIR,'/run/user/1000');assert.equal(env.GROQ_API_KEY,undefined);
});

function terminal() {
  const input=new PassThrough();input.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};
  const output=new PassThrough();output.isTTY=true;let text='';output.on('data',b=>text+=b);
  return {input,output,text:()=>text};
}
test('hidden prompt does not echo credentials and restores TTY state',async()=>{
  const t=terminal(), result=hiddenPrompt('Key: ',t.input,t.output);
  t.input.emit('keypress','fixture-hidden-value',{});t.input.emit('keypress','',{name:'backspace'});t.input.emit('keypress','',{name:'return'});
  assert.equal(await result,'fixture-hidden-valu');assert.equal(t.text(),'Key: \n');assert.equal(t.input.isRaw,false);assert.equal(t.input.listenerCount('keypress'),0);
});
test('hidden prompt cancels cleanly and refuses redirected stdin',async()=>{
  const t=terminal(),result=hiddenPrompt('Key: ',t.input,t.output);
  t.input.emit('keypress','c',{ctrl:true,name:'c'});await assert.rejects(result,/cancelled/);assert.equal(t.input.isRaw,false);
  t.input.isTTY=false;assert.throws(()=>hiddenPrompt('Key: ',t.input,t.output),/interactive terminal/);
});
test('platform protector selection and invalid reference fail closed',async()=>{
  assert.equal(defaultKeyProtector().scheme,process.platform==='linux'?'linux-secret-service-v1':'dpapi-current-user');
  await assert.rejects(new SecretServiceProtector().unprotect(Buffer.from('../unsafe')),/Invalid vault/);
});
async function bundleFixture(){
  const bundle=await mkdtemp(join(tmpdir(),'omni-linux-manifest-'));await mkdir(join(bundle,'payload'));
  const contents={'Launch.sh':'#!/bin/sh\n','Settings.sh':'#!/bin/sh\n','file.txt':'fixture-payload'};
  const files=[];
  for(const [path,data] of Object.entries(contents)){await writeFile(join(bundle,'payload',path),data);files.push({path,sha256:createHash('sha256').update(data).digest('hex')});}
  const manifest={version:'0.1.2',platform:'linux-x64',files};await writeFile(join(bundle,'manifest.json'),JSON.stringify(manifest));
  return {bundle,manifest};
}
test('manifest verifies every file and rejects tampering, extras and traversal',async()=>{
  const {bundle,manifest}=await bundleFixture();await verifyPayload(bundle);
  await writeFile(join(bundle,'payload/file.txt'),'tampered');await assert.rejects(verifyPayload(bundle),/checksum/);
  await writeFile(join(bundle,'payload/file.txt'),'fixture-payload');await writeFile(join(bundle,'payload/extra.txt'),'extra');await assert.rejects(verifyPayload(bundle),/checksum/);
  manifest.files[0].path='../escape';await writeFile(join(bundle,'manifest.json'),JSON.stringify(manifest));await assert.rejects(verifyPayload(bundle),/Unsafe/);
});
test('Linux install preserves data and previous version on rerun',{skip:process.platform!=='linux'},async()=>{
  const {bundle}=await bundleFixture();const parent=await mkdtemp(join(tmpdir(),'omni-install-')),root=join(parent,'Install With Spaces');
  await installLinux(bundle,root);await mkdir(join(root,'data'));await writeFile(join(root,'data/keep'),'existing-user-data');
  await installLinux(bundle,root);assert.equal(await readFile(join(root,'data/keep'),'utf8'),'existing-user-data');
  const existing=join(parent,'unrelated');await mkdir(existing);await assert.rejects(installLinux(bundle,existing),/without an OmniRoute/);
  const link=join(parent,'link');await symlink(existing,link);await assert.rejects(installLinux(bundle,link),/symlink/);
});
