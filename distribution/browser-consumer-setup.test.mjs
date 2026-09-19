import test from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getRuntimePaths,loadConfig,saveConfig} from '../packages/config/dist/index.js';
import {regularConfig} from './settings.mjs';

const bridge=await import('./browser-consumer-setup.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});

test('browser consumer bridge launches a visible shared session without waiting for account sign-in',()=>{
  assert.equal(typeof bridge.browserConsumerCommand,'function','browser consumer package bridge missing');
  const root='/safe/install',node='/safe/node',entrypoint='/safe/shared-session.mjs';
  assert.deepEqual(bridge.browserConsumerCommand('launch',{root,node,entrypoint}),[node,entrypoint,'--launch-only','--profile',join(root,'data/browser-consumer-profile'),'--port','47842']);
});

test('browser consumer bridge configures only local adapters after explicit confirmation',async()=>{
  assert.equal(typeof bridge.enableBrowserConsumers,'function','browser consumer enabler missing');
  const root=await mkdtemp(join(tmpdir(),'omni-browser-bridge-'));
  await saveConfig(regularConfig(),getRuntimePaths(join(root,'data')));
  await bridge.enableBrowserConsumers({root,node:join(root,'node'),adapterEntrypoint:join(root,'browser-adapter.mjs'),claudeEntrypoint:join(root,'claude-adapter.mjs'),zaiEntrypoint:join(root,'zai-adapter.mjs')});
  const config=await loadConfig(getRuntimePaths(join(root,'data')));
  for(const [provider,entrypoint,args] of [
    ['claude-consumer',join(root,'claude-adapter.mjs'),['--endpoint','http://127.0.0.1:47842']],
    ['zai-consumer',join(root,'zai-adapter.mjs'),['--endpoint','http://127.0.0.1:47842']],
    ['qwen-consumer',join(root,'browser-adapter.mjs'),['--provider','qwen','--endpoint','http://127.0.0.1:47842']],
    ['kimi-consumer',join(root,'browser-adapter.mjs'),['--provider','kimi','--endpoint','http://127.0.0.1:47842']],
    ['deepseek-consumer',join(root,'browser-adapter.mjs'),['--provider','deepseek','--endpoint','http://127.0.0.1:47842']],
    ['perplexity-consumer',join(root,'browser-adapter.mjs'),['--provider','perplexity','--endpoint','http://127.0.0.1:47842']],
  ]) {
    const item=config.providers.find(candidate=>candidate.id===provider);
    assert.equal(item.enabled,true,provider);
    assert.equal(item.credentialField,null,provider);
    assert.equal(item.freeTierConfirmed,true,provider);
    assert.deepEqual(item.mcpArgs,[entrypoint,...args],provider);
  }
});

test('Windows autostart uses a command launcher, removes only the owned legacy VBS, and validates paths',async()=>{
  assert.equal(typeof bridge.installBrowserConsumerAutostart,'function','browser consumer autostart missing');
  const home=await mkdtemp(join(tmpdir(),'omni-browser-startup-')),root=join(home,'install'),appData=join(home,'AppData/Roaming');
  const node=join(root,'node.exe'),entrypoint=join(root,'shared-session.mjs');
  await mkdir(root,{recursive:true});await writeFile(node,'fixture');await writeFile(entrypoint,'fixture');
  const startup=join(appData,'Microsoft/Windows/Start Menu/Programs/Startup');await mkdir(startup,{recursive:true});
  const legacy=join(startup,'OmniRoute Browser Consumers.vbs');await writeFile(legacy,'CreateObject("WScript.Shell").Run "shared-session.mjs --port 47842", 0, False\r\n');
  const result=await bridge.installBrowserConsumerAutostart({platform:'win32',home,root,node,entrypoint,env:{APPDATA:appData}});
  assert.match(result.file,/OmniRoute Browser Consumers\.cmd$/);
  const command=await (await import('node:fs/promises')).readFile(result.file,'utf8');
  assert.match(command,/^@echo off\r?\nstart "" \/b /);
  assert.match(command,/--background --launch-only --profile/);
  await assert.rejects(access(legacy),{code:'ENOENT'});
  await assert.rejects(bridge.installBrowserConsumerAutostart({platform:'win32',home,root,node:join(root,'missing.exe'),entrypoint,env:{APPDATA:appData}}),/not found|missing/i);
});
