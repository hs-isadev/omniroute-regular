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
  qwen:{url:'https://chat.qwen.ai/',modelId:'qwen-web-consumer'},
  kimi:{url:'https://www.kimi.com/',modelId:'kimi-web-consumer'},
  deepseek:{url:'https://chat.deepseek.com/',modelId:'deepseek-web-consumer'},
  perplexity:{url:'https://www.perplexity.ai/',modelId:'perplexity-web-consumer'},
};

test('private consumer registry shares one browser endpoint and profile',()=>{
  assert.equal(typeof runtime.getConsumerDefinition,'function','shared browser consumer runtime missing');
  const session=runtime.getSharedSessionDefinition();
  assert.equal(session.port,47842);
  assert.equal(session.profileName,'browser-consumer-profile');
  assert.deepEqual(session.urls,['https://claude.ai/new','https://chat.z.ai/','https://chat.qwen.ai/','https://www.kimi.com/','https://chat.deepseek.com/','https://www.perplexity.ai/']);
  for(const [id,want] of Object.entries(expected)){
    const item=runtime.getConsumerDefinition(id);
    assert.equal(item.port,session.port);
    assert.equal(item.url,want.url);
    assert.equal(item.modelId,want.modelId);
    assert.match(item.inputSelector,/textarea|contenteditable|textbox/);
    assert.match(item.responseSelector,/assistant|answer|markdown|message/i);
    assert.equal(item.profileName,session.profileName);
    assert.equal(item.privateLocalOnly,true);
  }
  assert.throws(()=>runtime.getConsumerDefinition('unknown'),/unknown browser consumer/i);
});

test('shared browser launch opens all providers in one persistent loopback session',async()=>{
  const session=runtime.getSharedSessionDefinition();
  const args=runtime.buildSharedBrowserArguments('/safe/browser-profile',{background:true});
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=47842'));
  assert.ok(args.includes('--user-data-dir=/safe/browser-profile'));
  assert.ok(args.includes('--start-minimized'));
  assert.deepEqual(args.slice(-session.urls.length),session.urls);
  assert.doesNotMatch(args.join(' '),/--headless|--no-sandbox|--incognito/);
  const item=runtime.getConsumerDefinition('qwen');
  assert.equal(await runtime.findConsumerBrowser(item,{platform:'linux',env:{OMNIROUTE_QWEN_BROWSER:'/opt/qwen-browser'},exists:async path=>path==='/opt/qwen-browser'}),'/opt/qwen-browser');
});

test('auth detection uses URL and visible UI only, never browser storage',()=>{
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('deepseek'),'https://chat.deepseek.com/sign_in'),true);
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('deepseek'),'https://chat.deepseek.com/'),false);
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('qwen'),'https://chat.qwen.ai/login?redirect=%2F'),true);
  assert.equal(runtime.isLoginUrl(runtime.getConsumerDefinition('perplexity'),'https://www.perplexity.ai/'),false);
  assert.doesNotMatch(String(runtime.waitForConsumerAuthentication),/cookies|localStorage|sessionStorage/i);
});

test('all browser consumers configure against one endpoint and install one Linux autostart',async()=>{
  assert.equal(typeof setup.configurePrivateBrowserConsumers,'function');
  assert.equal(typeof setup.installSharedBrowserConsumerAutostart,'function');
  const home=await mkdtemp(join(tmpdir(),'private-consumers-'));
  const root=join(home,'install'),node=join(root,'node'),entrypoint=join(root,'credential-server.mjs');
  await saveConfig(regularConfig(),getRuntimePaths(join(root,'data')));
  await setup.configurePrivateBrowserConsumers({root,node,entrypoint:join(root,'adapter.mjs')});
  const configured=await loadConfig(getRuntimePaths(join(root,'data')));
  for(const [id,want] of Object.entries(expected)){
    const provider=configured.providers.find(item=>item.id===`${id}-consumer`);
    assert.equal(provider.enabled,true);
    assert.equal(provider.credentialField,null);
    assert.deepEqual(provider.mcpArgs,[join(root,'adapter.mjs'),'--provider',id,'--endpoint','http://127.0.0.1:47842']);
  }
  const result=await setup.installSharedBrowserConsumerAutostart({platform:'linux',home,root,node,entrypoint});
  const text=await readFile(result.file,'utf8');
  assert.match(text,/--port 47842/);
  assert.match(text,/browser-consumer-profile/);
  assert.match(text,/--background/);
  assert.doesNotMatch(text,/--provider|cookie|token|password/i);
});

test('setup launches one shared browser bootstrap',async()=>{
  assert.equal(typeof setup.launchSharedBrowserConsumerSetup,'function');
  const calls=[];
  await setup.launchSharedBrowserConsumerSetup('/install',{run:async(command,args)=>calls.push([command,args]),node:'/node',entrypoint:'/shared-session.mjs'});
  assert.deepEqual(calls,[['/node',['/shared-session.mjs','--profile','/install/data/browser-consumer-profile','--port','47842']]]);
});
