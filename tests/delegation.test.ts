import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { WorkerTaskPacket } from "@omniroute/contracts";
import { prepareWorkerTask, renderWorkerTask } from "@omniroute/core";
import { CODEX_OMNIROUTE_FIRST_POLICY } from "@omniroute/integrations";

const packet: WorkerTaskPacket = {objective: "Review this pure function", excerpts: [{path: "math.ts", text: "export const add=(a,b)=>a+b;"}], constraints: ["No edits", "No edits"], acceptanceCriteria: ["List concrete issues only"], requestedOutput: "One short finding", independent: true, worthwhile: true, responseTokens: 128, instructionReserveTokens: 256, synthesisReserveTokens: 512};

test("task packet is minimized and host owns synthesis", () => {
  const result = prepareWorkerTask({...packet, transcript: "PRIVATE_TRANSCRIPT", credentials: "PRIVATE_CREDENTIAL"} as WorkerTaskPacket, {contextWindow: 4096, maxOutputTokens: 512});
  assert.ok(result.shouldDelegate);
  assert.equal(result.synthesisOwner, "host");
  assert.doesNotMatch(result.prompt!, /PRIVATE_/);
  assert.equal(result.prompt!.split("No edits").length - 1, 1);
  assert.match(result.prompt!, /host owns decisions, local edits, verification and final synthesis/);
});

test("unknown, insufficient and exact worker context boundaries", () => {
  const estimate = prepareWorkerTask(packet, {contextWindow: 4096, maxOutputTokens: 512}).totalTokens;
  for (const contextWindow of [null, 0]) assert.equal(prepareWorkerTask(packet, {contextWindow, maxOutputTokens: 512}).reason, "WORKER_LIMIT_UNKNOWN");
  assert.equal(prepareWorkerTask(packet, {contextWindow: estimate - 1, maxOutputTokens: 512}).shouldDelegate, false);
  assert.equal(prepareWorkerTask(packet, {contextWindow: estimate, maxOutputTokens: 128}).shouldDelegate, true);
  assert.equal(prepareWorkerTask(packet, {contextWindow: 4096, maxOutputTokens: 127}).reason, "WORKER_BUDGET_EXCEEDED");
  assert.equal(prepareWorkerTask(packet, {contextWindow: 4096, maxOutputTokens: null}).reason, "WORKER_LIMIT_UNKNOWN");
});

test("coupled or low-value work stays with host; sensitive filenames are rejected", () => {
  for (const field of ["independent", "worthwhile"]) assert.equal(prepareWorkerTask({...packet, [field]: false}, {contextWindow: 4096, maxOutputTokens: 512}).reason, "HOST_WORK_PREFERRED");
  assert.throws(() => renderWorkerTask({...packet, excerpts: [{path: ".env", text: "excluded"}]}), /UNSAFE_TASK_EXCERPT/);
});

test("Codex and Antigravity instructions cover context budgeting, ownership and actual host availability", async () => {
  const antigravity = await readFile(new URL("../distribution/antigravity.mjs", import.meta.url), "utf8");
  for (const instructions of [CODEX_OMNIROUTE_FIRST_POLICY, antigravity]) for (const phrase of ["canonical task", "acceptance criteria", "taskPacket", "context", "synthesis", "independent", "small-only"]) assert.ok(instructions.includes(phrase), phrase);
  assert.match(CODEX_OMNIROUTE_FIRST_POLICY, /model-neutral/i);
  assert.match(CODEX_OMNIROUTE_FIRST_POLICY, /do not assume a model name/i);
  assert.match(antigravity, /model-neutral/i);
  assert.doesNotMatch(antigravity, /do not assume it can run Sol or Astra/);
});
