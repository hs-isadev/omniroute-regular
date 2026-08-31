import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrateWorkspace, removeWorkspaceIntegration, hostEnvironment, findAntigravity } from './antigravity.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omni-antigravity-'));
  const workspace = join(root, 'Project With Spaces'); await mkdir(workspace);
  return { root, workspace, node:process.execPath, runtimeRoot:join(root,'data'), entrypoint:join(root,'mcp.mjs') };
}

test('workspace integration is preview-first, secret-free and preserves other servers', async () => {
  const options = await fixture();
  await mkdir(join(options.workspace,'.agents'));
  const path = join(options.workspace,'.agents/mcp_config.json');
  await writeFile(path,JSON.stringify({mcpServers:{other:{command:'other-server'}},custom:true}));
  const preview = await integrateWorkspace(options);
  assert.equal(preview.applied,false);
  assert.equal(JSON.parse(await readFile(path)).mcpServers.omniroute_regular,undefined);
  await integrateWorkspace({...options,apply:true});
  const result=JSON.parse(await readFile(path));
  assert.equal(result.custom,true);assert.equal(result.mcpServers.other.command,'other-server');
  assert.equal(result.mcpServers.omniroute_regular.command,process.execPath);
  assert.deepEqual(result.mcpServers.omniroute_regular.args,[options.entrypoint]);
  assert.equal(result.mcpServers.omniroute_regular.env.OMNIROUTE_HOME,options.runtimeRoot);
  assert.doesNotMatch(JSON.stringify(result.mcpServers.omniroute_regular),/API_KEY|password|oauth/i);
  assert.match(await readFile(join(options.workspace,'.agents/rules/omniroute-regular.md'),'utf8'),/routingMode="regular"/);
  assert.equal((await integrateWorkspace({...options,apply:true})).changed,false);
  await removeWorkspaceIntegration({...options,apply:true});
  assert.deepEqual(JSON.parse(await readFile(path)),{mcpServers:{other:{command:'other-server'}},custom:true});
});

test('unowned collisions and user-modified integration are never overwritten', async () => {
  const options=await fixture();await mkdir(join(options.workspace,'.agents'));
  const path=join(options.workspace,'.agents/mcp_config.json');
  await writeFile(path,JSON.stringify({mcpServers:{omniroute_regular:{command:'user-owned'}}}));
  await assert.rejects(integrateWorkspace({...options,apply:true}),/conflict/i);
  assert.equal(JSON.parse(await readFile(path)).mcpServers.omniroute_regular.command,'user-owned');
  const second=await fixture();await integrateWorkspace({...second,apply:true});
  const rules=join(second.workspace,'.agents/rules/omniroute-regular.md');
  await writeFile(rules,'user modification');
  await assert.rejects(removeWorkspaceIntegration({...second,apply:true}),/modified|conflict/i);
  assert.equal(await readFile(rules,'utf8'),'user modification');
});

test('host environment excludes API keys and code injection environment options', () => {
  const env=hostEnvironment({PATH:'path',HOME:'home',LOCALAPPDATA:'local',DBUS_SESSION_BUS_ADDRESS:'bus',XDG_RUNTIME_DIR:'run',GROQ_API_KEY:'secret',NODE_OPTIONS:'--require evil',OMNIROUTE_HOME:'other'});
  assert.equal(env.PATH,'path');assert.equal(env.DBUS_SESSION_BUS_ADDRESS,'bus');
  assert.equal(env.GROQ_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.OMNIROUTE_HOME,undefined);
});

test('host detection requires an absolute trusted installation path, not workspace PATH', async () => {
  const options=await fixture();
  assert.equal(await findAntigravity({platform:'win32',env:{LOCALAPPDATA:options.root},searchPath:false}),null);
  await assert.rejects(findAntigravity({executable:'relative.exe'}),/absolute/i);
});
