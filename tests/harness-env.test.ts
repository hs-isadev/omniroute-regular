import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHarnessLauncher } from "../apps/cli/src/harness-env.js";
import { claudeHarnessEnvironment, openCodeHarnessArguments, openCodeHarnessEnvironment, openCodeRegularConfig, selectClaudeLauncher, selectHarnessLauncher } from "../apps/cli/src/harness-env.js";

for (const mode of ["regular", "orchestrator"] as const) {
  test(`Claude ${mode} harness inherits no unrelated credentials`, () => {
    const environment = claudeHarnessEnvironment({
      Path: "C:\\Windows\\System32",
      USERPROFILE: "C:\\Users\\test",
      OPENAI_API_KEY: "openai-secret",
      GEMINI_API_KEY: "gemini-secret",
      GROQ_API_KEY: "groq-secret",
      OPENROUTER_API_KEY: "router-secret",
      OMNIROUTE_DAEMON_TOKEN: "daemon-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      NODE_OPTIONS: "--require=malicious.js",
    }, mode, "C:\\runtime\\omniroute");

    assert.equal(environment.Path, "C:\\Windows\\System32");
    assert.equal(environment.USERPROFILE, "C:\\Users\\test");
    assert.equal(environment.OMNIROUTE_ROUTING_MODE, mode);
    assert.equal(environment.OMNIROUTE_HOME, "C:\\runtime\\omniroute");
    for (const key of ["OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OMNIROUTE_DAEMON_TOKEN", "AWS_SECRET_ACCESS_KEY", "NODE_OPTIONS"]) {
      assert.equal(environment[key], undefined, `${key} should not be inherited`);
    }
  });
}

test("Claude launcher selection rejects a workspace-planted Windows shim", () => {
  const selected = selectClaudeLauncher([
    "C:\\project\\claude.cmd",
    "C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd",
  ], "C:\\project");
  assert.equal(selected, "C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd");
});

test("OpenCode regular harness uses a clean environment and only the configured free gateway", () => {
  const apiKey = "openrouter-test-key-never-print";
  const inlineConfig = openCodeRegularConfig("C:\\node.exe", "C:\\omni.js", "C:\\runtime\\omniroute", "C:\\instructions.md");
  const environment = openCodeHarnessEnvironment({
    PATH: "C:\\Windows\\System32",
    USERPROFILE: "C:\\Users\\test",
    OPENAI_API_KEY: "openai-secret",
    ANTHROPIC_API_KEY: "anthropic-secret",
    OPENROUTER_API_KEY: "inherited-router-secret",
    OMNIROUTE_DAEMON_TOKEN: "daemon-secret",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
    NODE_OPTIONS: "--require=malicious.js",
  }, "C:\\runtime\\omniroute", apiKey, inlineConfig);
  assert.equal(environment.OMNIROUTE_ROUTING_MODE, "regular");
  assert.equal(environment.OMNIROUTE_HOME, "C:\\runtime\\omniroute");
  assert.equal(environment.OPENROUTER_API_KEY, apiKey);
  assert.equal(environment.OPENCODE_CONFIG_CONTENT, inlineConfig);
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OMNIROUTE_DAEMON_TOKEN", "AWS_SECRET_ACCESS_KEY", "NODE_OPTIONS"]) assert.equal(environment[key], undefined);
  assert.doesNotMatch(inlineConfig, /openrouter-test-key-never-print/);
  const config = JSON.parse(inlineConfig) as { model: string; small_model: string; enabled_providers: string[]; provider: { openrouter: { whitelist: string[]; models: Record<string, { options: { provider: { allow_fallbacks: boolean } } }> } }; mcp: { omniroute: { environment: Record<string, string> } } };
  assert.equal(config.model, "openrouter/openrouter/free");
  assert.equal(config.small_model, "openrouter/openrouter/free");
  assert.deepEqual(config.enabled_providers, ["openrouter"]);
  assert.deepEqual(config.provider.openrouter.whitelist, ["openrouter/free"]);
  assert.equal(config.provider.openrouter.models["openrouter/free"]?.options.provider.allow_fallbacks, false);
  assert.equal(config.mcp.omniroute.environment.OMNIROUTE_ROUTING_MODE, "regular");
  assert.doesNotMatch(inlineConfig, /API_KEY|AUTH_TOKEN|secret/i);
});

test("generic harness launcher selection rejects workspace shims", () => {
  assert.equal(selectHarnessLauncher(["C:\\workspace\\opencode.cmd", "C:\\Users\\test\\AppData\\Roaming\\npm\\opencode.cmd"], "C:\\workspace"), "C:\\Users\\test\\AppData\\Roaming\\npm\\opencode.cmd");
});

test("OpenCode wrapper disables external plugins and pins the free model", () => {
  assert.deepEqual(openCodeHarnessArguments(), ["--pure", "--model", "openrouter/openrouter/free"]);
});

test("model-label adapter changes only the host transport and display name", () => {
  const config = JSON.parse(openCodeRegularConfig("node", "cli", "runtime", "instructions", "http://127.0.0.1:12345"));
  assert.equal(config.provider.openrouter.options.baseURL, "http://127.0.0.1:12345");
  assert.equal(config.model, "openrouter/openrouter/free");
  assert.deepEqual(config.provider.openrouter.whitelist, ["openrouter/free"]);
  assert.match(config.provider.openrouter.models["openrouter/free"].name, /actual model shown/);
  assert.equal(config.provider.openrouter.models["openrouter/free"].options.provider.allow_fallbacks, false);
});

test("global npm launcher is allowed from home without allowing home-folder shims", () => {
  const profile = "C:\\Users\\test", bin = `${profile}\\AppData\\Roaming\\npm`;
  assert.equal(selectHarnessLauncher([`${profile}\\opencode.cmd`, `${profile}\\project\\opencode.cmd`, `${bin}\\opencode.cmd`], profile, [bin]), `${bin}\\opencode.cmd`);
  assert.equal(selectHarnessLauncher([`${bin}\\nested\\opencode.cmd`, `${bin}-fake\\opencode.cmd`], profile, [bin]), null);
  assert.equal(selectHarnessLauncher([`${bin}\\opencode.cmd`], bin, [bin]), null);
});

test("child directory beginning with two dots is still inside the workspace", () => {
  assert.equal(selectHarnessLauncher(["C:\\project\\..evil\\opencode.cmd"], "C:\\project"), null);
});

test("resolver skips executable-shaped directories on PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "omni-launcher-"));
  const cwd = join(root, "project"), bin = join(root, "bin");
  try {
    await mkdir(cwd); await mkdir(bin); await mkdir(join(bin, "opencode.exe"));
    await writeFile(join(bin, "opencode.cmd"), "@echo off\r\n");
    const env = { PATH: bin, PATHEXT: ".EXE;.CMD" };
    assert.equal(await resolveHarnessLauncher("opencode", env, cwd, "win32"), join(bin, "opencode.cmd"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("resolver rejects an external junction back into project shims", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "omni-launcher-link-"));
  const cwd = join(root, "project"), payload = join(cwd, "bin"), link = join(root, "external-bin");
  try {
    await mkdir(payload, { recursive: true });
    await writeFile(join(payload, "opencode.cmd"), "@echo off\r\n");
    await symlink(payload, link, "junction");
    await assert.rejects(resolveHarnessLauncher("opencode", { PATH: link, PATHEXT: ".CMD" }, cwd, "win32"), /trusted PATH location/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
