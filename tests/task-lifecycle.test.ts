import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PersistentTaskStore, TaskLifecycle } from "@omniroute/core";

const submission = {
  objective: "Verify an explicit task lifecycle",
  constraints: ["No external write"],
  contextReferences: [],
  requiredCapabilities: ["text" as const],
  approvedTools: [],
  budget: { maxAttempts: 1, maxOutputTokens: 256, maxLatencyMs: 10_000, maxCostUsd: 0 },
  stopConditions: ["failed verification"],
  acceptanceCriteria: ["return redacted report"],
  idempotencyKey: "lifecycle-key",
};

test("lifecycle operations are explicit, approval-gated, and report only durable redacted state", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-lifecycle-"));
  try {
    const lifecycle = new TaskLifecycle(new PersistentTaskStore(root));
    const created = await lifecycle.submit(submission);
    const paused = await lifecycle.pause(created.id, "awaiting user confirmation");
    assert.equal(paused.state, "paused-for-approval");
    await assert.rejects(lifecycle.approve(created.id, ""), /TASK_APPROVAL_REQUIRED/);
    const resumed = await lifecycle.approve(created.id, "local-approval");
    assert.equal(resumed.state, "planning");
    const executing = await lifecycle.start(created.id, { providerId: "openrouter", modelId: "openrouter/free", reasoningEffort: "low", maxOutputTokens: 256 });
    const verifying = await lifecycle.verify(executing.id, { check: "focused test", status: "passed", summary: "ok" });
    assert.equal(verifying.state, "verifying");
    const cancelled = await lifecycle.cancel(created.id, "stop");
    assert.equal(cancelled.state, "cancelled");
    const report = await lifecycle.report(created.id);
    assert.equal(report.verification[0]?.check, "focused test");
    assert.equal(report.redactedError, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
