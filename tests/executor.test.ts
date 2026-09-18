import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ControlledExecutor, type CommandRunner } from "@omniroute/core";

test("controlled executors reject disabled declarations, unapproved side effects, escaped workspaces, and undeclared environment", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-executor-"));
  try {
    const executor = new ControlledExecutor([{ id: "writer", enabled: false, command: process.execPath, commandArgs: ["-e", ""], workspaceRoots: [root], environmentAllowlist: ["MODE"], timeoutMs: 100, maxConcurrent: 1, sideEffect: "workspace-write", supportsCancellation: true, maxOutputBytes: 100 }]);
    await assert.rejects(executor.execute({ executorId: "writer", workspace: root, environment: { MODE: "test" }, approvalId: "approved" }), /EXECUTOR_DISABLED/);
    const enabled = new ControlledExecutor([{ id: "writer", enabled: true, command: process.execPath, commandArgs: ["-e", ""], workspaceRoots: [root], environmentAllowlist: ["MODE"], timeoutMs: 100, maxConcurrent: 1, sideEffect: "workspace-write", supportsCancellation: true, maxOutputBytes: 100 }]);
    await assert.rejects(enabled.execute({ executorId: "writer", workspace: root, environment: { MODE: "test" } }), /EXECUTOR_APPROVAL_REQUIRED/);
    await assert.rejects(enabled.execute({ executorId: "writer", workspace: join(root, ".."), environment: { MODE: "test" }, approvalId: "approved" }), /EXECUTOR_WORKSPACE_DENIED/);
    await assert.rejects(enabled.execute({ executorId: "writer", workspace: root, environment: { SECRET: "no" }, approvalId: "approved" }), /EXECUTOR_ENV_DENIED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a declared executor receives fixed argv and an allowlisted environment, then returns redacted bounded output", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-executor-"));
  const calls: Array<{ command: string; args: string[]; cwd: string; env: Record<string, string> }> = [];
  const runner: CommandRunner = { run: async (input) => { calls.push({ command: input.command, args: input.args, cwd: input.cwd, env: input.env }); return { exitCode: 0, stdout: "secret=hide\n" + "x".repeat(300), stderr: "" }; } };
  try {
    const executor = new ControlledExecutor([{ id: "reader", enabled: true, command: process.execPath, commandArgs: ["-e", "console.log('ok')"], workspaceRoots: [root], environmentAllowlist: ["MODE"], timeoutMs: 100, maxConcurrent: 1, sideEffect: "none", supportsCancellation: true, maxOutputBytes: 80 }], runner);
    const result = await executor.execute({ executorId: "reader", workspace: root, environment: { MODE: "test" } });
    assert.equal(result.status, "completed");
    assert.equal(calls[0]?.command, process.execPath);
    assert.deepEqual(calls[0]?.args, ["-e", "console.log('ok')"]);
    assert.deepEqual(calls[0]?.env, { MODE: "test" });
    assert.doesNotMatch(result.stdout, /hide/);
    assert.equal(result.truncated, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a cancellation-aware executor stops its runner and records a structured cancelled result", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-executor-"));
  const runner: CommandRunner = { run: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) };
  try {
    const executor = new ControlledExecutor([{ id: "slow", enabled: true, command: process.execPath, commandArgs: ["-e", ""], workspaceRoots: [root], environmentAllowlist: [], timeoutMs: 10_000, maxConcurrent: 1, sideEffect: "none", supportsCancellation: true, maxOutputBytes: 100 }], runner);
    const controller = new AbortController();
    const pending = executor.execute({ executorId: "slow", workspace: root, environment: {}, signal: controller.signal });
    controller.abort(new DOMException("cancelled", "AbortError"));
    assert.equal((await pending).status, "cancelled");
  } finally { await rm(root, { recursive: true, force: true }); }
});
