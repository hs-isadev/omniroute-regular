import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
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
