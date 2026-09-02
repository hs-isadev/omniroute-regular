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
