import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PersistentTaskStore,
  createTaskEnvelope,
  transitionTaskEnvelope,
  type TaskSubmission,
} from "@omniroute/core";

const submission: TaskSubmission = {
  objective: "Implement a bounded feature",
  constraints: ["No external side effects"],
  contextReferences: [{ path: "packages/core/src/index.ts", symbol: "OmniRouter" }],
  requiredCapabilities: ["coding"],
  approvedTools: ["repository.read"],
  budget: { maxAttempts: 2, maxOutputTokens: 800, maxLatencyMs: 30_000, maxCostUsd: 0 },
  stopConditions: ["test failure"],
  acceptanceCriteria: ["Focused test passes"],
  idempotencyKey: "durable-task-test-key",
};

test("a durable task follows only legal lifecycle transitions and redacts recorded errors", () => {
  const task = createTaskEnvelope(submission, "2026-09-18T00:00:00.000Z", "task-one");
  const planning = transitionTaskEnvelope(task, "planning", { at: "2026-09-18T00:00:01.000Z" });
  const executing = transitionTaskEnvelope(planning, "executing", { at: "2026-09-18T00:00:02.000Z", route: { providerId: "openrouter", modelId: "openrouter/free", reasoningEffort: "low", maxOutputTokens: 800 } });
  const failed = transitionTaskEnvelope(executing, "failed", { at: "2026-09-18T00:00:03.000Z", error: "Bearer super-secret-token failed" });
  assert.equal(failed.state, "failed");
  assert.equal(failed.attempt, 1);
  assert.doesNotMatch(failed.redactedError ?? "", /super-secret-token/);
  assert.throws(() => transitionTaskEnvelope(failed, "executing", { at: "2026-09-18T00:00:04.000Z" }), /TASK_TRANSITION_INVALID/);
});

test("the store returns an idempotent submission and recovers unfinished tasks after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-task-state-"));
  try {
    const first = new PersistentTaskStore(root);
    const created = await first.submit(submission, "2026-09-18T00:00:00.000Z");
    await first.transition(created.id, "planning", { at: "2026-09-18T00:00:01.000Z" });
    const second = new PersistentTaskStore(root);
    const duplicate = await second.submit({ ...submission, objective: "Ignored because the key is identical" }, "2026-09-18T00:00:02.000Z");
    const recovered = await second.recover();
    assert.equal(duplicate.id, created.id);
    assert.equal(duplicate.objective, submission.objective);
    assert.deepEqual(recovered.map((item) => item.id), [created.id]);
    const persisted = JSON.parse(await readFile(join(root, "tasks", `${created.id}.json`), "utf8")) as { schemaVersion: number; state: string };
    assert.equal(persisted.schemaVersion, 1);
    assert.equal(persisted.state, "planning");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminal tasks are excluded from recovery and no task identifier can escape the state directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-task-state-"));
  try {
    const store = new PersistentTaskStore(root);
    const task = await store.submit({ ...submission, idempotencyKey: "terminal-key" }, "2026-09-18T00:00:00.000Z");
    await store.transition(task.id, "planning", { at: "2026-09-18T00:00:01.000Z" });
    await store.transition(task.id, "executing", { at: "2026-09-18T00:00:02.000Z" });
    await store.transition(task.id, "verifying", { at: "2026-09-18T00:00:03.000Z" });
    await store.transition(task.id, "completed", { at: "2026-09-18T00:00:04.000Z" });
    assert.deepEqual(await store.recover(), []);
    await assert.rejects(store.get("../escape"), /TASK_ID_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
