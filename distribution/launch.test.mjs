import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, access, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
async function prepareLaunch(options) {
  const source=await readFile(new URL('./launch.mjs',import.meta.url),'utf8');
  assert.match(source,/export async function prepareLaunch/,'Launcher must expose a side-effect-free preparation API before it can be imported');
  assert.doesNotMatch(source,/startHostModelProxy|DaemonClient|SecretVault/,'Never import the legacy live launcher during fixture tests');
  return (await import('./launch.mjs')).prepareLaunch(options);
}

test('launch previews without writes and missing host gives official installation guidance',async()=>{
  const root=await mkdtemp(join(tmpdir(),'omni-launch-'));
  const workspace=join(root,'project');await mkdir(workspace);
  await assert.rejects(prepareLaunch({root,workspace,host:null}),/antigravity.google\/download/);
  const result=await prepareLaunch({root,workspace,host:{executable:process.execPath,kind:'cli'}});
  assert.equal(result.integration.applied,false);
  assert.equal(result.cwd,workspace);assert.deepEqual(result.args,[]);
  await assert.rejects(access(join(workspace,'.agents/mcp_config.json')),/ENOENT/);
});
test('launch explicitly applies only selected workspace and contains no proxy or OpenCode',async()=>{
  const root=await mkdtemp(join(tmpdir(),'omni-launch-'));
  const workspace=join(root,'project');await mkdir(workspace);
  const result=await prepareLaunch({root,workspace,apply:true,host:{executable:process.execPath,kind:'desktop'}});
  assert.deepEqual(result.args,[workspace]);
  const config=JSON.parse(await readFile(join(workspace,'.agents/mcp_config.json')));
  assert.match(config.mcpServers.omniroute_regular.args[0],/mcp-regular.mjs$/);
  assert.equal(config.mcpServers.omniroute_regular.env.OMNIROUTE_HOME,join(root,'data'));
  assert.doesNotMatch(await readFile(new URL('./launch.mjs',import.meta.url),'utf8'),/startHostModelProxy|DaemonClient|opencode\/opencode/);
});
test('launcher CLI preview, fake host invocation and detach stay in a temporary project',async()=>{
  const root=await mkdtemp(join(tmpdir(),'omni-launch-cli-')),workspace=join(root,'project');await mkdir(workspace);
  // Explicit node test-host executes this fixture only. It is not Antigravity.
  await writeFile(join(workspace,'index.js'),"console.log('FAKE HOST ONLY');");
  const entry=fileURLToPath(new URL('./launch.mjs',import.meta.url)),env={SYSTEMROOT:process.env.SYSTEMROOT??'',OMNIROUTE_REGULAR_ROOT:root};
  const run=promisify(execFile),args=[entry,'--workspace',workspace,'--host',process.execPath];
  assert.match((await run(process.execPath,[...args,'--dry-run'],{env})).stdout,/Preview only/);
  assert.match((await run(process.execPath,[...args,'--apply'],{env})).stdout,/FAKE HOST ONLY/);
  await run(process.execPath,[entry,'--workspace',workspace,'--detach','--apply'],{env});
  await assert.rejects(access(join(workspace,'.agents/rules/omniroute-regular.md')),/ENOENT/);
  await assert.rejects(run(process.execPath,[entry],{env:{SYSTEMROOT:process.env.SYSTEMROOT??''}}),/installed Launch/);
  await assert.rejects(run(process.execPath,[entry,'--workspace'],{env}),/Missing value/);
});
