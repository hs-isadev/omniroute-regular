import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
async function source(path){return readFile(resolve(root,path),'utf8');}

test('Windows setup creates API Keys shortcuts that open the stable key editor',async()=>{
  const [setup,launcher,readme,dualSetup,form,settings]=await Promise.all([
    source('distribution/dual/Setup.ps1'),
    source('distribution/dual/Launch.ps1'),
    source('distribution/dual/README.md'),
    source('distribution/dual-setup.mjs'),
    source('distribution/Settings.ps1'),
    source('distribution/settings.mjs')
  ]);
  assert.match(setup,/@\('OmniRoute API Keys','keys'\)/);
  assert.match(setup,/Launch\.ps1.*-Action '\+\$item\[1\]/);
  assert.match(setup,/foreach\(\$location in @\(\$desktop,\$startMenu\)\)/);
  assert.match(dualSetup,/else if\(action==='keys'\)await openKeyForm\(root,\{existingSetup:true\}\)/);
  assert.match(form,/for\(\$slot=1;\$slot -le 5;\$slot\+\+\)/);
  assert.match(form,/Check saved key statuses/);
  assert.match(form,/replaceSlots/);
  assert.match(launcher,/ValidateSet\([^\n]*'keys'/);
  assert.match(launcher,/\$guiAction=\$Action -in @\([^\n]*'keys'/);
  assert.match(launcher,/if\(\$guiAction\).*?\$node \$entry \$Action/s);
  assert.match(readme,/click \*\*OmniRoute API Keys\*\*[\s\S]*five slots per provider[\s\S]*filled slots are never overwritten[\s\S]*duplicate keys are skipped/i);
  assert.match(form,/Skipped duplicate keys/);
  assert.match(settings,/DUPLICATE_CREDENTIAL/);
  assert.match(settings,/findNextFreeSlot/);
  assert.match(settings,/checkCredentialStatuses/);
});

test('Linux setup creates a clickable API Keys application-menu launcher',async()=>{
  const [bootstrap,settingsGui]=await Promise.all([source('distribution/dual/bootstrap-linux.mjs'),source('distribution/settings-gui.py')]);
  assert.match(bootstrap,/for\(const \[label,action\].*?\['API Keys','keys'\]/s);
  assert.match(bootstrap,/omniroute-'\+action\+'\.desktop/);
  assert.match(bootstrap,/quote\(join\(root,'Launch\.sh'\)\)\+' '\+action/);
  assert.match(settingsGui,/parser\.add_argument\('--existing', action='store_true'\)/);
  assert.match(settingsGui,/if existing_setup:[\s\S]*--existing[\s\S]*--restart/);
});

test('shareable package version is bumped consistently without overwriting the prior release',async()=>{
  const [packager,sealer,packageTest,notes,installer]=await Promise.all([
    source('scripts/package-private.mjs'),
    source('scripts/seal-private.mjs'),
    source('scripts/test-family-package.mjs'),
    source('docs/releases/v0.6.7.md'),
    source('distribution/install.mjs')
  ]);
  for(const file of [packager,sealer,packageTest])assert.match(file,/0\.6\.7/);
  assert.match(packager,/Package folder exists; preserve it before rebuilding/);
  assert.match(sealer,/Archive already exists; never silently overwrite/);
  assert.match(notes,/quota|rate.limit/i);
  assert.match(notes,/harness[\s\S]*?forward it to the\s+bundled OmniRoute CLI/i);
  assert.match(notes,/only the active runtime/i);
  assert.match(notes,/rollback.*not available|no rollback/i);
  assert.match(installer,/async function pruneOldRuntimeVersions/);
  assert.match(packager,/provider-key-status\.tdd\.md/);
  assert.match(packager,/harness-launch-and-version-prune\.tdd\.md/);
});
