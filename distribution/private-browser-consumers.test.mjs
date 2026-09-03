import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getRuntimePaths,loadConfig,saveConfig} from '../packages/config/dist/index.js';
import {regularConfig} from './settings.mjs';

const runtime=await import('../packages/browser-consumer-adapter/src/runtime.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});
const setup=await import('./dual-setup.mjs');

const expected={
  qwen:{port:47844,url:'https://qwen.ai/',modelId:'qwen-web-consumer'},
  kimi:{port:47845,url:'https://www.kimi.com/',modelId:'kimi-web-consumer'},
  deepseek:{port:47846,url:'https://chat.deepseek.com/',modelId:'deepseek-web-consumer'},
  perplexity:{port:47847,url:'https://www.perplexity.ai/',modelId:'perplexity-web-consumer'},
};

test('private consumer registry has isolated ports, profiles, and semantic selectors',()=>{
  assert.equal(typeof runtime.getConsumerDefinition,'function','shared browser consumer runtime missing');
  for(const [id,want] of Object.entries(expected)){
    const item=runtime.getConsumerDefinition(id);
    assert.equal(item.port,want.port);
    assert.equal(item.url,want.url);
    assert.equal(item.modelId,want.modelId);
    assert.match(item.inputSelector,/textarea|contenteditable|textbox/);
    assert.match(item.responseSelector,/assistant|answer|markdown|message/i);
    assert.equal(item.profileName,`${id}-consumer-profile`);
    assert.equal(item.privateLocalOnly,true);
  }
  assert.throws(()=>runtime.getConsumerDefinition('unknown'),/unknown browser consumer/i);
});

test('shared browser launch is loopback-only, persistent, and supports browser overrides',async()=>{
  const item=runtime.getConsumerDefinition('qwen');
  const args=runtime.buildBrowserArguments(item,'/safe/qwen-profile',item.port,{background:true});
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=47844'));
  assert.ok(args.includes('--user-data-dir=/safe/qwen-profile'));
  assert.ok(args.includes('--start-minimized'));
  assert.equal(args.at(-1),item.url);
  assert.doesNotMatch(args.join(' '),/--headless|--no-sandbox|--incognito/);
  assert.equal(await runtime.findConsumerBrowser(item,{platform:'linux',env:{OMNIROUTE_QWEN_BROWSER:'/opt/qwen-browser'},exists:async path=>path==='/opt/qwen-browser'}),'/opt/qwen-browser');
});

test('auth detection uses URL and visible UI only, never browser storage',()=>{
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('deepseek'),'https://chat.deepseek.com/sign_in'),true);
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('deepseek'),'https://chat.deepseek.com/'),false);
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('qwen'),'https://qwen.ai/login?redirect=%2F'),true);
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('perplexity'),'https://www.perplexity.ai/'),false);
  assert.doesNotMatch(String(runtime.waitForConsumerAuthentication),/cookies|localStorage|sessionStorage/i);
});

test('private consumers configure and autostart independently on Linux',async()=>{
  assert.equal(typeof setup.configurePrivateBrowserConsumers,'function');
  assert.equal(typeof setup.installPrivateBrowserConsumerAutostarts,'function');
  const home=await mkdtemp(join(tmpdir(),'private-consumers-'));
  const root=join(home,'install'),node=join(root,'node'),entrypoint=join(root,'credential-server.mjs');
  await saveConfig(regularConfig(),getRuntimePaths(join(root,'data')));
  await setup.configurePrivateBrowserConsumers({root,node,entrypoint:join(root,'adapter.mjs')});
  const configured=await loadConfig(getRuntimePaths(join(root,'data')));
  for(const [id,want] of Object.entries(expected)){
    const provider=configured.providers.find(item=>item.id===`${id}-consumer`);
    assert.equal(provider.enabled,true);
    assert.equal(provider.credentialField,null);
    assert.deepEqual(provider.mcpArgs,[join(root,'adapter.mjs'),'--provider',id,'--endpoint',`http://127.0.0.1:${want.port}`]);
  }
  const results=await setup.installPrivateBrowserConsumerAutostarts({platform:'linux',home,root,node,entrypoint});
  assert.equal(results.length,4);
  for(const [id,want] of Object.entries(expected)){
    const result=results.find(item=>item.id===id);
    const text=await readFile(result.file,'utf8');
    assert.match(text,new RegExp(`--provider ${id}`));
    assert.match(text,new RegExp(`--port ${want.port}`));
    assert.match(text,new RegExp(`${id}-consumer-profile`));
    assert.match(text,/--background/);
    assert.doesNotMatch(text,/cookie|token|password/i);
  }
});

test('all six browser setup tasks start concurrently',async()=>{
  assert.equal(typeof setup.launchAllConsumerSetups,'function');
  const started=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const launchers=Object.fromEntries(['claude','zai','qwen','kimi','deepseek','perplexity'].map(id=>[id,async root=>{started.push([id,root]);await gate;}]));
  const pending=setup.launchAllConsumerSetups('/install',launchers);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(started.map(([id])=>id),['claude','zai','qwen','kimi','deepseek','perplexity']);
  release();await pending;
});
