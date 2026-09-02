import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=name=>readFile(new URL(name,import.meta.url),'utf8');
test('default packages bundle MCP but not OpenCode and include provenance',async()=>{
  const build=await source('../scripts/package-regular.mjs');
  assert.doesNotMatch(build,/const openCodePackage|opencode:.*1\.18/);
  for(const name of ['antigravity.mjs','mcp-regular.mjs','install.mjs','provenance.json','dependencies.json','docs/testing/antigravity-regular.tdd.md']) assert.ok(build.includes(name),name);
});
test('v0.5 release preserves attribution and includes both browser consumer routes',async()=>{
  const build=await source('../scripts/package-dual.mjs');
  assert.match(build,/version='0\.5\.0'/);
  for(const component of ['contracts','core','integrations','mcp-server','observability','providers']) assert.ok(build.includes(component),`updated ${component} dist is not overlaid`);
  assert.match(build,/hosts:\['opencode','antigravity','codex','claude-code','claude-web-consumer','glm-web-consumer'\]/);
  assert.match(build,/packages\/zai-consumer-adapter/);
  assert.match(build,/personalDataIncluded:false/);
  assert.match(build,/THIRD-PARTY-NOTICES\.md/);
  const notice=await source('../THIRD-PARTY-NOTICES.md');
  assert.match(notice,/Copyright \(c\) 2026 diegosouzapw/);
  assert.match(notice,/MIT License/);
});
test('both platform launchers forward project arguments through versioned installs',async()=>{
  assert.match(await source('Launch.sh'),/active-version.txt/);
  assert.match(await source('Launch.sh'),/"\$@"/);
  assert.match(await source('Launch.ps1'),/active-version.txt/);
  assert.match(await source('Setup.ps1'),/install.mjs/);
  assert.match(await source('Setup.sh'),/install.mjs/);
  assert.doesNotMatch(await source('Settings.ps1'),/OpenRouter is required/);
});
test('Linux extracted-package smoke follows package version instead of a stale archive',async()=>{
  const smoke=await source('../scripts/linux-package-smoke.sh');
  assert.doesNotMatch(smoke,/OmniRoute-Regular-\d+\.\d+\.\d+/);
  assert.match(smoke,/version=/);
});
