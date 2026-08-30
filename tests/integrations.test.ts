import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getRuntimePaths } from "@omniroute/config";
import { CODEX_OMNIROUTE_FIRST_POLICY, defaultHostPaths, IntegrationManager } from "@omniroute/integrations";
import { parse as parseToml } from "smol-toml";

test("Codex integration preserves unrelated config, is idempotent, removable, and restorable", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-integration-"));
  const home = join(root, "home");
  const runtime = getRuntimePaths(join(root, "runtime"));
  const host = defaultHostPaths(home);
  const manager = new IntegrationManager({ hostPaths: host, runtimePaths: runtime, nodePath: "C:\\Program Files\\nodejs\\node.exe", cliPath: "C:\\OmniRoute\\bin.js" });
  try {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(host.codexConfig, 'model = "gpt-user-choice"\napproval_policy = "on-request"\n');
    await writeFile(host.codexHooks, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "existing-tool" }] }] } }, null, 2));
    await writeFile(host.codexAgents, "# Existing global instructions\n\n- Keep this.\n");
    const plan = await manager.plan("codex", "install");
    assert.equal(plan.changed, true);
    assert.ok(plan.changes.every((change) => !change.redactedDiff.includes("undefined")));
    await manager.apply(plan);
    assert.match(await readFile(host.codexConfig, "utf8"), /gpt-user-choice/);
    assert.match(await readFile(host.codexConfig, "utf8"), /BEGIN OMNIROUTE/);
    assert.match(await readFile(host.codexHooks, "utf8"), /existing-tool/);
    assert.match(await readFile(host.codexAgents, "utf8"), /Keep this/);
    assert.ok((await readFile(host.codexAgents, "utf8")).includes(CODEX_OMNIROUTE_FIRST_POLICY));
    const installed = parseToml(await readFile(host.codexConfig, "utf8")) as any;
    assert.equal(installed.approval_policy, "on-request");
    assert.equal(installed.mcp_servers.omniroute.default_tools_approval_mode, "prompt");
    assert.deepEqual(Object.keys(installed.mcp_servers.omniroute.tools).sort(), ["omni_models", "omni_route", "omni_routes"]);
    assert.equal(installed.mcp_servers.omniroute.tools.omni_route.approval_mode, "approve");
    const repeatPlan = await manager.plan("codex", "install");
    assert.equal(repeatPlan.changed, false, JSON.stringify(repeatPlan.changes.map((change) => ({ path: change.path, diff: change.redactedDiff }))));
    const remove = await manager.plan("codex", "remove");
    await manager.apply(remove);
    assert.doesNotMatch(await readFile(host.codexConfig, "utf8"), /OMNIROUTE/);
    assert.match(await readFile(host.codexConfig, "utf8"), /approval_policy/);
    await manager.restore("codex");
    assert.match(await readFile(host.codexConfig, "utf8"), /BEGIN OMNIROUTE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Claude Code merge preserves unrelated MCP servers and hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-claude-"));
  const home = join(root, "home"), host = defaultHostPaths(home);
  const manager = new IntegrationManager({ hostPaths: host, runtimePaths: getRuntimePaths(join(root, "runtime")), nodePath: "C:\\node.exe", cliPath: "C:\\omni.js" });
  try {
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(host.claudeConfig, JSON.stringify({ mcpServers: { existing: { type: "http", url: "https://example.com/mcp" } }, theme: "dark" }));
    await writeFile(host.claudeSettings, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "existing" }] }] } }));
    await manager.apply(await manager.plan("claude-code", "install"));
    const config = JSON.parse(await readFile(host.claudeConfig, "utf8"));
    assert.equal(config.theme, "dark"); assert.ok(config.mcpServers.existing); assert.equal(config.mcpServers.omniroute.env.OMNIROUTE_MANAGED, "1");
    assert.match(await readFile(host.claudeSettings, "utf8"), /existing/);
    assert.equal((await manager.plan("claude-code", "install")).changed, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("OpenCode integration preserves user config, adds managed regular MCP/instructions, and is idempotent/removable", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-opencode-"));
  const home = join(root, "home"), host = defaultHostPaths(home);
  const runtime = getRuntimePaths(join(root, "runtime"));
  const manager = new IntegrationManager({ hostPaths: host, runtimePaths: runtime, nodePath: "C:\\node.exe", cliPath: "C:\\omni.js" });
  try {
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await writeFile(host.openCodeConfig, JSON.stringify({ theme: "dark", model: "user/model", mcp: { existing: { type: "remote", url: "https://example.test/mcp" } }, instructions: ["C:\\Users\\test\\custom.md"] }));
    const install = await manager.plan("opencode", "install");
    assert.equal(install.changed, true);
    assert.ok(install.changes.every((change) => !change.redactedDiff.includes("undefined")));
    await manager.apply(install);
    const configured = JSON.parse(await readFile(host.openCodeConfig, "utf8")) as { theme: string; model: string; mcp: Record<string, { environment?: Record<string, string> }>; instructions: string[] };
    assert.equal(configured.theme, "dark");
    assert.equal(configured.model, "user/model");
    assert.ok(configured.mcp.existing);
    assert.equal(configured.mcp.omniroute.environment?.OMNIROUTE_MANAGED, "1");
    assert.equal(configured.mcp.omniroute.environment?.OMNIROUTE_ROUTING_MODE, "regular");
    assert.deepEqual(configured.instructions, ["C:\\Users\\test\\custom.md", host.openCodeInstructions]);
    const instructions = await readFile(host.openCodeInstructions, "utf8");
    assert.match(instructions, /OmniRoute regular mode/);
    assert.match(instructions, /routingMode=regular/);
    assert.match(instructions, /Never request orchestrator mode/);
    assert.equal((await manager.plan("opencode", "install")).changed, false);
    await manager.apply(await manager.plan("opencode", "remove"));
    const removed = JSON.parse(await readFile(host.openCodeConfig, "utf8")) as { theme: string; mcp: Record<string, unknown>; instructions: string[] };
    assert.equal(removed.theme, "dark");
    assert.ok(removed.mcp.existing);
    assert.equal(removed.mcp.omniroute, undefined);
    assert.deepEqual(removed.instructions, ["C:\\Users\\test\\custom.md"]);
    assert.equal((await manager.plan("opencode", "remove")).changed, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("integration refuses to overwrite an unrecognized existing hook shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-hook-shape-"));
  const home = join(root, "home"), host = defaultHostPaths(home);
  const manager = new IntegrationManager({ hostPaths: host, runtimePaths: getRuntimePaths(join(root, "runtime")), nodePath: "C:\\node.exe", cliPath: "C:\\omni.js" });
  try {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(host.codexHooks, JSON.stringify({ hooks: { UserPromptSubmit: { custom: "user-owned" } } }));
    await assert.rejects(manager.plan("codex", "install"), /refusing to overwrite/i);
    assert.match(await readFile(host.codexHooks, "utf8"), /user-owned/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
