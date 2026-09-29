import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
async function source(path){return readFile(resolve(root,path),'utf8');}

test('Windows setup creates API Keys shortcuts that open the stable key editor',async()=>{
  const [setup,launcher,readme]=await Promise.all([
    source('distribution/dual/Setup.ps1'),
    source('distribution/dual/Launch.ps1'),
    source('distribution/dual/README.md')
  ]);
  assert.match(setup,/@\('OmniRoute API Keys','keys'\)/);
  assert.match(setup,/Launch\.ps1.*-Action '\+\$item\[1\]/);
  assert.match(setup,/foreach\(\$location in @\(\$desktop,\$startMenu\)\)/);
  assert.match(launcher,/ValidateSet\([^\n]*'keys'/);
  assert.match(launcher,/\$guiAction=\$Action -in @\([^\n]*'keys'/);
  assert.match(launcher,/if\(\$guiAction\).*?\$node \$entry \$Action/s);
  assert.match(readme,/click \*\*OmniRoute API Keys\*\*[\s\S]*add or\s+replace provider keys/);
});

test('Linux setup creates a clickable API Keys application-menu launcher',async()=>{
  const bootstrap=await source('distribution/dual/bootstrap-linux.mjs');
  assert.match(bootstrap,/for\(const \[label,action\].*?\['API Keys','keys'\]/s);
  assert.match(bootstrap,/omniroute-'\+action\+'\.desktop/);
  assert.match(bootstrap,/quote\(join\(root,'Launch\.sh'\)\)\+' '\+action/);
});

test('private package version is bumped consistently without overwriting the prior release',async()=>{
  const [packager,sealer,packageTest,notes]=await Promise.all([
    source('scripts/package-private.mjs'),
    source('scripts/seal-private.mjs'),
    source('scripts/test-family-package.mjs'),
    source('docs/releases/v0.6.6-private.11.md')
  ]);
  for(const file of [packager,sealer,packageTest])assert.match(file,/0\.6\.6-private\.11/);
  assert.match(packager,/Private package folder exists; preserve it before rebuilding/);
  assert.match(sealer,/Archive already exists; never silently overwrite/);
  assert.match(notes,/OmniRoute API Keys/);
});
