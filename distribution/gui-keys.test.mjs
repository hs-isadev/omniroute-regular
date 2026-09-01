import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('./gui-keys.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
test('Windows key setup uses a masked form and explicit shared profile, not a text editor',()=>{
  assert.equal(typeof mod.keyFormCommand,'function');
  const c=mod.keyFormCommand('/install',{platform:'win32',node:'/node.exe',app:'/app',systemRoot:'C:/Windows'});
  assert.match(c.command,/powershell.exe$/);assert.ok(c.args.includes('-STA'));assert.ok(c.args.includes('-Simple'));assert.ok(c.args.includes('-RequireReady'));assert.ok(c.args.some(v=>/install[/\\]data$/.test(v)));
  assert.ok(!c.args.some(v=>v.includes('key-editor')));
});
test('Linux form uses Python isolated mode without credentials in arguments',()=>{
  assert.equal(typeof mod.keyFormCommand,'function');
  const c=mod.keyFormCommand('/install',{platform:'linux',node:'/node',app:'/app'});
  assert.equal(c.command,'/usr/bin/python3');assert.ok(c.args.includes('-I'));assert.ok(c.args.some(v=>v.endsWith('settings-gui.py')));
  assert.ok(c.args.some(v=>/install[/\\]data$/.test(v)));assert.throws(()=>mod.keyFormCommand('relative',{platform:'linux'}),/absolute/i);
  assert.throws(()=>mod.keyFormCommand('/install',{platform:'darwin'}),/Windows or Linux/);
});
test('form launch rejects a relative profile before starting any child process',async()=>{
  await assert.rejects(mod.openKeyForm('relative'),/Absolute/);
});
