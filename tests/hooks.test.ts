import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../apps/cli/dist/bin.js", import.meta.url));

async function invokeHook(host: "codex" | "claude", payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "hook", host], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk)); child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) { reject(new Error(Buffer.concat(stderr).toString("utf8"))); return; }
      resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")) as Record<string, unknown>);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

for (const host of ["codex", "claude"] as const) {
  test(`${host} UserPromptSubmit hook emits fast local context without claiming a host model`, async () => {
    const result = await invokeHook(host, { prompt: "Implement a broad multi-file migration, then run tests." });
    const specific = result.hookSpecificOutput as { hookEventName?: string; additionalContext?: string };
    assert.equal(specific.hookEventName, "UserPromptSubmit");
    assert.match(specific.additionalContext ?? "", /OmniRoute/);
    assert.match(specific.additionalContext ?? "", /host model (?:is unknown|without authoritative host metadata)/i);
  });
}
