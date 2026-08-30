import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { EXTRA_FREE_PROVIDERS } from "@omniroute/config";

const cli = fileURLToPath(new URL("../apps/cli/dist/bin.js", import.meta.url));

async function runCli(arguments_: string[], home: string, stdinText?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...arguments_], { env: { ...process.env, OMNIROUTE_HOME: home }, windowsHide: true, stdio: [stdinText === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let inputSent = false;
    if (arguments_[0] === "hook" && stdinText !== undefined) { inputSent = true; child.stdin.end(stdinText); }
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
      if (stdinText !== undefined && !inputSent) { inputSent = true; child.stdin.end(stdinText); }
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

test("standalone CLI setup creates only local encrypted runtime state and a safe import path", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-cli-"));
  try {
    const result = await runCli(["setup"], root);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { runtimeRoot?: string; credentialImport?: string; orchestrator?: string };
    assert.equal(output.runtimeRoot, root);
    assert.equal(output.credentialImport, join(root, "import", "credentials.txt"));
    assert.equal(output.orchestrator, "openrouter/openrouter/free");
    assert.equal(output.defaultMode, "regular");
    assert.equal(output.freeOnly, true);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /OPENAI_API_KEY=\S+/);
    assert.match(await readFile(join(root, "vault", "vault.json"), "utf8"), /dpapi-current-user/);
    const credentials = await readFile(join(root, "import", "credentials.txt"), "utf8");
    assert.doesNotMatch(credentials, /OPENAI_API_KEY=/);
    assert.doesNotMatch(credentials, /ANTHROPIC_API_KEY=/);
    assert.match(credentials, /OPENROUTER_API_KEY=\r?\n/);
    assert.match(credentials, /GEMINI_API_KEY=\r?\n/);
    assert.match(credentials, /GROQ_API_KEY=\r?\n/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Codex prompt hook enforces OmniRoute-first without Claude gateway advice", { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-codex-hook-"));
  try {
    for (const prompt of ["What is a rainbow?", "Review a complex database migration for correctness and regressions"]) {
      const result = await runCli(["hook", "codex"], root, JSON.stringify({ prompt }));
      assert.equal(result.code, 0, result.stderr);
      const hook = JSON.parse(result.stdout).hookSpecificOutput;
      assert.equal(hook.hookEventName, "UserPromptSubmit");
      assert.match(hook.additionalContext, /omni_route tool first/);
      assert.match(hook.additionalContext, /without explicit user approval for native agents/);
      assert.match(hook.additionalContext, /routingMode="regular"/);
      assert.doesNotMatch(hook.additionalContext, /Claude Code gateway|Answer normally/);
    }
    const empty = await runCli(["hook", "codex"], root, "{}");
    assert.equal(empty.code, 0, empty.stderr);
    assert.equal(empty.stdout, "");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("chat displays the persisted daemon default when --mode is omitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-cli-mode-"));
  try {
    assert.equal((await runCli(["setup"], root)).code, 0);
    const configPath = join(root, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as { routing: { defaultMode: string } };
    config.routing.defaultMode = "orchestrator";
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const result = await runCli(["chat"], root, "/exit\n");
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /OmniRoute chat \(orchestrator mode\)/);
    assert.doesNotMatch(result.stdout, /undefined mode/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("OpenCode harness rejects orchestrator and subscription modes before credentials or launch", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-cli-opencode-"));
  try {
    const orchestrator = await runCli(["harness", "opencode", "--mode", "orchestrator"], root);
    assert.notEqual(orchestrator.code, 0);
    assert.match(orchestrator.stderr, /HARNESS_MODE_INVALID/);
    const subscription = await runCli(["harness", "opencode", "--mode", "regular", "--subscription"], root);
    assert.notEqual(subscription.code, 0);
    assert.match(subscription.stderr, /HARNESS_SUBSCRIPTION_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("integration CLI rejects unknown targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-cli-target-"));
  try {
    const result = await runCli(["integrate", "not-a-host"], root);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /INTEGRATION_TARGET_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("provider CLI persists opt-in activation for both modes and can disable it", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-cli-provider-"));
  try {
    const blocked = await runCli(["providers", "enable", "mistral"], root);
    assert.notEqual(blocked.code, 0);
    assert.match(blocked.stderr, /FREE_TIER_CONFIRMATION_REQUIRED/);
    const enabled = await runCli(["providers", "enable", "mistral", "--confirm-free-tier"], root);
    assert.equal(enabled.code, 0, enabled.stderr);
    assert.deepEqual(JSON.parse(enabled.stdout).modes, ["regular", "orchestrator"]);
    const listed = await runCli(["providers", "list"], root);
    const profiles = JSON.parse(listed.stdout);
    assert.equal(profiles.filter((item: { credentialField: string | null }) => item.credentialField !== null).length, EXTRA_FREE_PROVIDERS.length + 3);
    assert.equal(profiles.find((item: { id: string }) => item.id === "mistral").enabled, true);
    assert.equal((await runCli(["providers", "disable", "mistral"], root)).code, 0);
    const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
    assert.equal(config.providers.find((item: { id: string }) => item.id === "mistral").freeTierConfirmed, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
