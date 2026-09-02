import test from 'node:test';
import assert from 'node:assert/strict';

const browser=await import('../packages/zai-consumer-adapter/src/browser.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});
const dom=await import('../packages/zai-consumer-adapter/src/dom.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});

test('Z.AI consumer browser uses a dedicated profile and loopback-only debugging',()=>{
  assert.equal(typeof browser.buildBrowserArguments,'function','Z.AI consumer browser arguments missing');
  const args=browser.buildBrowserArguments('/safe/zai-profile',47843,{background:true});
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=47843'));
  assert.ok(args.includes('--user-data-dir=/safe/zai-profile'));
  assert.ok(args.includes('--start-minimized'));
  assert.equal(args.at(-1),'https://chat.z.ai/');
  assert.doesNotMatch(args.join(' '),/--headless|--no-sandbox/);
});

test('Z.AI browser discovery supports generic overrides and Vivaldi on Windows',async()=>{
  assert.equal(typeof browser.findConsumerBrowser,'function','Z.AI browser discovery missing');
  const generic=await browser.findConsumerBrowser({
    platform:'win32',home:'C:\\Users\\Person',env:{OMNIROUTE_BROWSER:'D:\\Portable\\chrome.exe'},
    exists:async path=>path==='D:\\Portable\\chrome.exe',
  });
  assert.equal(generic,'D:\\Portable\\chrome.exe');
  const vivaldi=await browser.findConsumerBrowser({
    platform:'win32',home:'C:\\Users\\Person',
    env:{LOCALAPPDATA:'C:\\Users\\Person\\AppData\\Local',PROGRAMFILES:'C:\\Program Files'},
    exists:async path=>path.endsWith('Vivaldi\\Application\\vivaldi.exe'),
  });
  assert.match(vivaldi,/Vivaldi\\Application\\vivaldi\.exe$/);
});

test('Z.AI bootstrap can minimize the attached browser after sign-in',async()=>{
  assert.equal(typeof browser.minimizeBrowserWindow,'function','Z.AI browser minimization helper missing');
  const calls=[];
  const session={
    async send(method,payload){calls.push([method,payload]);return method==='Browser.getWindowForTarget'?{windowId:23}:{};},
    async detach(){calls.push(['detach']);},
  };
  await browser.minimizeBrowserWindow({newCDPSession:async()=>session},{});
  assert.deepEqual(calls.at(1),['Browser.setWindowBounds',{windowId:23,bounds:{windowState:'minimized'}}]);
  assert.deepEqual(calls.at(-1),['detach']);
});

test('Z.AI auth routes are detected without inspecting browser storage',()=>{
  assert.equal(typeof browser.isZaiLoginUrl,'function','Z.AI auth-route detection missing');
  assert.equal(browser.isZaiLoginUrl('https://chat.z.ai/auth?redirect=%2F'),true);
  assert.equal(browser.isZaiLoginUrl('https://chat.z.ai/'),false);
});

test('Z.AI response extraction keeps final answer text and removes the thinking chain',()=>{
  assert.match(dom.ZAI_ASSISTANT_RESPONSE_SELECTOR,/chat-assistant/);
  assert.equal(dom.cleanAssistantParts([
    {text:'Reasoning details',thinking:true},
    {text:'First paragraph',thinking:false},
    {text:'Second paragraph',thinking:false},
  ]),'First paragraph\nSecond paragraph');
});

test('Z.AI peak-hour handling switches semantically to GLM 5.3 Flash or requests fallback',()=>{
  assert.equal(typeof dom.decidePeakHourAction,'function','Z.AI peak-hour decision missing');
  assert.deepEqual(dom.decidePeakHourAction('Everything is available',['Switch to GLM5.3 Flash']),{action:'none',label:null});
  assert.deepEqual(dom.decidePeakHourAction('GLM is in peak hour',['Switch to GLM5.3 Flash']),{action:'switch',label:'Switch to GLM5.3 Flash'});
  assert.deepEqual(dom.decidePeakHourAction('Currently in peak hours',['Try later']),{action:'fallback',label:null});
  assert.deepEqual(dom.decidePeakHourAction('Currently IN PEAK HOUR',['switch to GLM-5.3 Flash']),{action:'switch',label:'switch to GLM-5.3 Flash'});
});
