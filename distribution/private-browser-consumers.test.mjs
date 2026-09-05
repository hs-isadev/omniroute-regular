import test from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getRuntimePaths,loadConfig,saveConfig} from '../packages/config/dist/index.js';
import {regularConfig} from './settings.mjs';

const runtime=await import('../packages/browser-consumer-adapter/src/runtime.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});
const setup=await import('./dual-setup.mjs');
const promptInput=await import('../packages/browser-consumer-adapter/src/prompt-input.mjs').catch(()=>({}));

const expected={
  qwen:{url:'https://chat.qwen.ai/',modelId:'qwen-web-consumer'},
  kimi:{url:'https://www.kimi.ai/login',modelId:'kimi-web-consumer'},
  deepseek:{url:'https://chat.deepseek.com/',modelId:'deepseek-web-consumer'},
  perplexity:{url:'https://www.perplexity.ai/',modelId:'perplexity-web-consumer'},
};

test('private consumer registry shares one browser endpoint and profile',()=>{
  assert.equal(typeof runtime.getConsumerDefinition,'function','shared browser consumer runtime missing');
  const session=runtime.getSharedSessionDefinition();
  assert.equal(session.port,47842);
  assert.equal(session.profileName,'browser-consumer-profile');
  assert.deepEqual(session.urls,['https://claude.ai/new','https://chat.z.ai/','https://chat.qwen.ai/','https://www.kimi.ai/login','https://chat.deepseek.com/','https://www.perplexity.ai/']);
  for(const [id,want] of Object.entries(expected)){
    const item=runtime.getConsumerDefinition(id);
    assert.equal(item.port,session.port);
    assert.equal(item.url,want.url);
    assert.equal(item.modelId,want.modelId);
    assert.match(item.inputSelector,/textarea|contenteditable|textbox/);
    assert.match(item.responseSelector,/assistant|answer|markdown|message/i);
    assert.match(item.signedOutSelector,/a:has-text/);
    assert.match(item.signedOutSelector,/\[role="button"\]:has-text/);
    assert.match(item.highThinkingSelector,/Thinking|DeepThink|Reasoning/i);
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
  const windowsLaunch=runtime.buildSharedBrowserLaunch({platform:'win32',browserPath:'C:\\Program Files\\Browser\\browser.exe',profileDir:'C:\\Safe Profile',background:true});
  assert.equal(windowsLaunch.command,'C:\\Program Files\\Browser\\browser.exe');
  assert.ok(windowsLaunch.args.includes('--user-data-dir=C:\\Safe Profile'));
  assert.ok(windowsLaunch.args.includes('--start-minimized'));
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
  const autostart=join(home,'.config/autostart');await mkdir(autostart,{recursive:true});
  for(const name of ['omniroute-claude-consumer.desktop','omniroute-zai-consumer.desktop','omniroute-qwen-consumer.desktop','omniroute-kimi-consumer.desktop','omniroute-deepseek-consumer.desktop','omniroute-perplexity-consumer.desktop'])await writeFile(join(autostart,name),'legacy');
  const result=await setup.installSharedBrowserConsumerAutostart({platform:'linux',home,root,node,entrypoint});
  const text=await readFile(result.file,'utf8');
  assert.match(text,/--port 47842/);
  assert.match(text,/browser-consumer-profile/);
  assert.match(text,/--background/);
  assert.doesNotMatch(text,/--provider|cookie|token|password/i);
  assert.equal(result.removed.length,6);
  for(const path of result.removed)await assert.rejects(access(path),{code:'ENOENT'});
});

test('Windows installs one hidden shared startup entry and removes exact legacy entries',async()=>{
  const home=await mkdtemp(join(tmpdir(),'private-consumers-win-')),root=join(home,'install'),appData=join(home,'AppData/Roaming');
  const startup=join(appData,'Microsoft/Windows/Start Menu/Programs/Startup');await mkdir(startup,{recursive:true});
  const legacy=['OmniRoute Claude Consumer.vbs','OmniRoute Z.AI Consumer.vbs','OmniRoute Qwen Consumer Private.vbs','OmniRoute Kimi Consumer Private.vbs','OmniRoute DeepSeek Consumer Private.vbs','OmniRoute Perplexity Consumer Private.vbs'];
  for(const name of legacy)await writeFile(join(startup,name),'legacy');
  const result=await setup.installSharedBrowserConsumerAutostart({platform:'win32',home,root,node:join(root,'node.exe'),entrypoint:join(root,'shared-session.mjs'),env:{APPDATA:appData}});
  const text=await readFile(result.file,'utf8');
  assert.match(text,/WScript\.Shell/);
  assert.match(text,/, 0, False/);
  assert.match(text,/--background/);
  assert.match(text,/browser-consumer-profile/);
  assert.equal(result.removed.length,6);
  for(const path of result.removed)await assert.rejects(access(path),{code:'ENOENT'});
});

test('setup launches one shared browser bootstrap',async()=>{
  assert.equal(typeof setup.launchSharedBrowserConsumerSetup,'function');
  const calls=[];
  await setup.launchSharedBrowserConsumerSetup('/install',{run:async(command,args)=>calls.push([command,args]),node:'/node',entrypoint:'/shared-session.mjs'});
  assert.deepEqual(calls,[['/node',['/shared-session.mjs','--profile',join('/install','data/browser-consumer-profile'),'--port','47842']]]);
});

test('private connection probe covers all six shared-session providers',async()=>{
  const source=await readFile(new URL('../scripts/probe-private-consumers.mjs',import.meta.url),'utf8');
  for(const id of ['claude','zai','qwen','kimi','deepseek','perplexity'])assert.match(source,new RegExp(`\\b${id}\\b`),id);
  assert.match(source,/claude-consumer-adapter\/src\/adapter\.mjs/);
  assert.match(source,/zai-consumer-adapter\/src\/adapter\.mjs/);
  assert.match(source,/browser-consumer-adapter\/src\/adapter\.mjs/);
  assert.match(source,/test_connection/);
});

test('private package includes limit and verification reports',async()=>{
  const source=await readFile(new URL('../scripts/package-private.mjs',import.meta.url),'utf8');
  assert.match(source,/MODEL-LIMITS\.md/);
  assert.match(source,/VERIFICATION\.md/);
});

test('browser prompts focus, pause briefly, then fill across all six consumers',async()=>{
  assert.equal(typeof promptInput.focusPauseAndFill,'function','shared prompt timing helper missing');
  const events=[],locator={click:async()=>events.push('click'),fill:async value=>events.push(`fill:${value}`)};
  const page={locator:selector=>{events.push(`locate:${selector}`);return {first:()=>locator};},waitForTimeout:async ms=>events.push(`wait:${ms}`)};
  await promptInput.focusPauseAndFill(page,'#prompt','hello');
  assert.deepEqual(events,['locate:#prompt','click','wait:150','fill:hello']);
  for(const path of ['../packages/claude-consumer-adapter/src/adapter.mjs','../packages/zai-consumer-adapter/src/adapter.mjs','../packages/browser-consumer-adapter/src/adapter.mjs']){
    const source=await readFile(new URL(path,import.meta.url),'utf8');
    assert.match(source,/focusPauseAndFill\(target/);
  }
});
