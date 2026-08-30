import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isSafeProviderBaseUrl } from "@omniroute/config";
import { AuditStore, globalRedactor, JsonlLogger, safeError, SafeError } from "@omniroute/observability";
import { assertSafeResolvedUrl } from "@omniroute/providers";
import { modelFixture } from "./helpers.js";
import type { AttributionRecord } from "@omniroute/contracts";

test("seeded fake secrets are removed from text, objects, errors, and logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-redact-"));
  const secret = "sk-ant-fake-seeded-secret-1234567890";
  globalRedactor.register(secret);
  try {
    assert.equal(globalRedactor.redactText(`before ${secret} after`), "before [REDACTED] after");
    assert.deepEqual(globalRedactor.redact({ authorization: `Bearer ${secret}`, safe: "ok" }), { authorization: "[REDACTED]", safe: "ok" });
    assert.doesNotMatch(safeError(new SafeError("TEST", secret)).message, new RegExp(secret));
    const path = join(root, "log.jsonl");
    await new JsonlLogger(path).write("error", "seeded", { nested: { message: secret } });
    assert.doesNotMatch(await readFile(path, "utf8"), new RegExp(secret));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("audit store persists attribution metadata but no arbitrary content fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-audit-"));
  try {
    const path = join(root, "routes.jsonl");
    await new AuditStore(path).append({ routeId: "r1", startedAt: new Date(0).toISOString(), endedAt: new Date(1).toISOString(), sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, orchestrator: { providerId: "openai", modelId: "gpt-5.6-sol", reasoningEffort: "low" }, worker: { providerId: "openai", modelId: "gpt-5.6-luna", reasoningEffort: "low", maxOutputTokens: 100 }, reviewers: [], fallbacksAttempted: [], taskClass: "small", policyDecisions: [], usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, estimatedCostUsd: 0.0001 }, latencyMs: 1, status: "completed", registrySnapshotId: "s1" });
    const text = await readFile(path, "utf8");
    assert.match(text, /gpt-5\.6-sol/);
    assert.doesNotMatch(text, /prompt|answer/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("aggregate spending reads beyond the 500-row recent-history display cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-spending-"));
  try {
    const path = join(root, "routes.jsonl");
    const base: AttributionRecord = { routeId: "r", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, orchestrator: { providerId: "openai", modelId: "gpt-5.6-sol", reasoningEffort: "low" }, worker: { providerId: "openai", modelId: "gpt-5.6-luna", reasoningEffort: "low", maxOutputTokens: 1 }, reviewers: [], fallbacksAttempted: [], taskClass: "micro", policyDecisions: [], usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, estimatedCostUsd: 0.001 }, latencyMs: 1, status: "completed", registrySnapshotId: "s" };
    await writeFile(path, `${Array.from({ length: 600 }, (_, index) => JSON.stringify({ ...base, routeId: `r${index}` })).join("\n")}\n`);
    const spending = await new AuditStore(path).spendingSince(new Date(Date.now() - 60_000));
    assert.ok(Math.abs(spending - 0.6) < 1e-9);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("provider URL policy blocks credentials, non-HTTPS remote URLs, and private targets", async () => {
  assert.equal(isSafeProviderBaseUrl(new URL("https://api.openai.com"), false), true);
  assert.equal(isSafeProviderBaseUrl(new URL("http://api.openai.com"), false), false);
  assert.equal(isSafeProviderBaseUrl(new URL("https://user:pass@example.com"), false), false);
  assert.equal(isSafeProviderBaseUrl(new URL("http://127.0.0.1:11434"), true), true);
  await assert.rejects(assertSafeResolvedUrl(new URL("https://127.0.0.1"), false), /private address/);
  await assert.rejects(assertSafeResolvedUrl(new URL("https://100.64.0.1"), false), /private address/);
  await assert.rejects(assertSafeResolvedUrl(new URL("https://[::]"), false), /private address/);
  await assert.rejects(assertSafeResolvedUrl(new URL("https://[::ffff:127.0.0.1]"), false), /private address/);
  await assert.doesNotReject(assertSafeResolvedUrl(new URL("http://127.0.0.1:11434"), true));
});

test("unknown model capability cannot be upgraded by name inference", () => {
  const model = modelFixture({ modelId: "looks-like-vision-pro", capabilities: { ...modelFixture().capabilities, imageInput: null } });
  assert.equal(model.capabilities.imageInput, null);
});
