import test from 'node:test';
import assert from 'node:assert/strict';

const browser=await import('../packages/claude-consumer-adapter/src/browser.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});

test('consumer browser discovery prefers a provider override, then a generic Chromium-family override',async()=>{
  assert.equal(typeof browser.findConsumerBrowser,'function','consumer browser discovery missing');
  const override=await browser.findConsumerBrowser({
    platform:'win32',home:'C:\\Users\\Person',
    env:{OMNIROUTE_CLAUDE_BROWSER:'D:\\Claude\\browser.exe',OMNIROUTE_BROWSER:'D:\\Generic\\browser.exe'},
    exists:async path=>path.endsWith('browser.exe'),
  });
  assert.equal(override,'D:\\Claude\\browser.exe');
  const generic=await browser.findConsumerBrowser({
    platform:'linux',home:'/home/person',env:{OMNIROUTE_BROWSER:'/opt/custom-browser'},
    exists:async path=>path==='/opt/custom-browser',
  });
  assert.equal(generic,'/opt/custom-browser');
});

test('consumer browser discovery covers major Chromium-family browsers on Windows and Linux',async()=>{
  const windows=await browser.findConsumerBrowser({
    platform:'win32',
    home:'C:\\Users\\Person',
    env:{LOCALAPPDATA:'C:\\Users\\Person\\AppData\\Local',PROGRAMFILES:'C:\\Program Files'},
    exists:async path=>path.endsWith('BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
  });
  assert.match(windows,/BraveSoftware\\Brave-Browser\\Application\\brave\.exe$/);
  const linux=await browser.findConsumerBrowser({
    platform:'linux',home:'/home/person',env:{PATH:'/usr/bin'},
    exists:async path=>path==='/usr/bin/microsoft-edge-stable',
  });
  assert.equal(linux,'/usr/bin/microsoft-edge-stable');
});

test('consumer browser uses a dedicated profile and loopback-only debugging',()=>{
  assert.equal(typeof browser.buildBrowserArguments,'function','consumer browser arguments missing');
  const args=browser.buildBrowserArguments('/safe/profile',9222,{background:true});
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=9222'));
  assert.ok(args.includes('--user-data-dir=/safe/profile'));
  assert.ok(args.includes('--start-minimized'));
  assert.equal(args.at(-1),'https://claude.ai/new');
  assert.doesNotMatch(args.join(' '),/--headless|--no-sandbox/);
});

test('consumer bootstrap can minimize an attached browser window after authentication',async()=>{
  assert.equal(typeof browser.minimizeBrowserWindow,'function','browser minimization helper missing');
  const calls=[];
  const page={};
  const session={
    async send(method,payload){calls.push([method,payload]);return method==='Browser.getWindowForTarget'?{windowId:17}:{};},
    async detach(){calls.push(['detach']);},
  };
  await browser.minimizeBrowserWindow({newCDPSession:async target=>{assert.equal(target,page);return session;}},page);
  assert.deepEqual(calls,[
    ['Browser.getWindowForTarget',undefined],
    ['Browser.setWindowBounds',{windowId:17,bounds:{windowState:'minimized'}}],
    ['detach'],
  ]);
});

test('consumer bootstrap waits for a visible signed-in surface without reading browser storage',async()=>{
  assert.equal(typeof browser.waitForConsumerAuthentication,'function','authentication wait helper missing');
  let signedIn=false;
  const page={
    url:()=>signedIn?'https://claude.ai/new':'https://claude.ai/login',
    locator:()=>({first:()=>({isVisible:async()=>signedIn})}),
    waitForTimeout:async()=>{signedIn=true;},
  };
  assert.equal(await browser.waitForConsumerAuthentication(page,{
    isLoginUrl:browser.isClaudeLoginUrl,
    readySelector:'[contenteditable="true"]',
    timeoutMs:100,
    pollMs:1,
  }),true);
});
