import test from 'node:test';
import assert from 'node:assert/strict';

const browser=await import('../packages/claude-consumer-adapter/src/browser.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});

test('consumer browser discovery prefers Opera GX on Windows and supports Linux browsers',async()=>{
  assert.equal(typeof browser.findConsumerBrowser,'function','consumer browser discovery missing');
  const windows=await browser.findConsumerBrowser({
    platform:'win32',
    home:'C:\\Users\\Person',
    env:{LOCALAPPDATA:'C:\\Users\\Person\\AppData\\Local',PROGRAMFILES:'C:\\Program Files'},
    exists:async path=>path.endsWith('Opera GX\\opera.exe'),
  });
  assert.match(windows,/Opera GX\\opera\.exe$/);
  const linux=await browser.findConsumerBrowser({
    platform:'linux',home:'/home/person',env:{PATH:'/usr/bin'},
    exists:async path=>path==='/usr/bin/chromium',
  });
  assert.equal(linux,'/usr/bin/chromium');
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
