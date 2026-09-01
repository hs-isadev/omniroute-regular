import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=name=>readFile(new URL(name,import.meta.url),'utf8');
test('default packages bundle MCP but not OpenCode and include provenance',async()=>{
  const build=await source('../scripts/package-regular.mjs');
  assert.doesNotMatch(build,/const openCodePackage|opencode:.*1\.18/);
  for(const name of ['antigravity.mjs','mcp-regular.mjs','install.mjs','provenance.json','dependencies.json','docs/testing/antigravity-regular.tdd.md']) assert.ok(build.includes(name),name);
});
test('dual release preserves upstream MIT attribution',async()=>{
  const build=await source('../scripts/package-dual.mjs');
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
