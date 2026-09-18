import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelSelection, RoutingDiagnostic, TaskClass, WorkerTaskPacket } from "@omniroute/contracts";
import { OmniRouter } from "@omniroute/core";
import { AuditStore, JsonlLogger } from "@omniroute/observability";
import { MockProvider } from "@omniroute/testing";
import { FreeModelFailover } from "../packages/core/src/free-failover.js";
import { freeConfigFixture, modelFixture, registryFixture } from "./helpers.js";

const seed: ModelSelection = {providerId: "groq", modelId: "a", reasoningEffort: "none", maxOutputTokens: 100};
function fixture() {
  const config = freeConfigFixture();
  config.routing.defaultMode = "regular";
  config.routing.directProviderOrder = ["groq", "qwen-consumer", "kimi-consumer"];
  config.routing.maxParallelWorkers = 1;
  for (const p of config.providers) {
    p.enabled = config.routing.directProviderOrder.includes(p.id);
    p.freeModelOrder = [];
    // Browser routes are deliberately unknown in production until the user confirms them.
    // This fixture models an explicitly confirmed local browser test adapter.
    if (p.id.endsWith("-consumer")) p.freeTierConfirmed = true;
  }
  const providers = new Map(config.routing.directProviderOrder.map(id => [id, new MockProvider(id)]));
  const snapshot = registryFixture(config.routing.directProviderOrder.flatMap(providerId => ["a", "b"].map(modelId => modelFixture({providerId, modelId, contextWindow: 32768, maxOutputTokens: 4096, pricing: {inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null}, capabilities: {text: true, coding: true, toolCalling: false, structuredOutput: false, web: false, imageInput: false, imageOutput: false, audioInput: false, audioOutput: false}}))));
  let now = 1000;
  return {config, providers, snapshot, ladder: new FreeModelFailover(config, providers, () => now), advance: () => {now += 60001;}};
}

test("36 ordinary selections distribute across three providers and equal models despite Groq being first", () => {
  const f = fixture(), counts: Record<string, number> = {};
  for (let i = 0; i < 36; i++) {
    const {selection, diagnostic} = f.ladder.select(seed, f.snapshot, ["text"], 20, "lightweight", {taskClass: "small"});
    assert.ok(selection);
    const key = selection.providerId + "/" + selection.modelId;
    counts[key] = (counts[key] ?? 0) + 1;
    assert.equal(diagnostic.reason, "BALANCED_LEAST_DISPATCHED");
  }
  assert.equal(Object.keys(counts).length, 6);
  assert.deepEqual(Object.values(counts), [6, 6, 6, 6, 6, 6]);
});

for (const taskClass of ["medium", "large", "critical"] as TaskClass[]) test(`browser consumers are excluded for ${taskClass}`, () => {
  const f = fixture();
  const result = f.ladder.select(seed, f.snapshot, ["text"], 20, "quality", {taskClass});
  assert.equal(result.selection?.providerId, "groq");
  assert.equal(result.diagnostic.reason, "ONLY_ELIGIBLE_PROVIDER");
  assert.ok(result.diagnostic.candidates.filter(c => c.providerId.endsWith("-consumer") && c.modelId).every(c => c.reasons.includes("TASK_CLASS_LIMIT")));
});

test("capability, context, quota, health, availability and pin exclusions are explicit", () => {
  const f = fixture();
  f.snapshot.models[0]!.health.status = "unhealthy";
  f.snapshot.models[1]!.rateLimitState = "limited";
  f.providers.delete("kimi-consumer");
  const result = f.ladder.select(seed, f.snapshot, ["web"], 40000, "quality", {taskClass: "small"});
  assert.equal(result.selection, undefined);
  const reasons = result.diagnostic.candidates.flatMap(c => c.reasons);
  for (const code of ["HEALTH_UNHEALTHY", "QUOTA_LIMITED", "ADAPTER_UNAVAILABLE", "CAPABILITY_WEB", "CONTEXT_LIMIT"]) assert.ok(reasons.includes(code));
  assert.equal(f.ladder.select(seed, f.snapshot, ["text"], 20, "quality", {taskClass: "critical", pin: {providerId: "qwen-consumer"}}).selection, undefined);
});

test("strict pins and intentional provider priorities override balancing", () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) assert.equal(f.ladder.select(seed, f.snapshot, ["text"], 20, "quality", {taskClass: "small", pin: {providerId: "kimi-consumer", modelId: "b"}}).selection?.modelId, "b");
  f.config.routing.providerPriorities = {"qwen-consumer": 10};
  for (let i = 0; i < 5; i++) {
    const result = f.ladder.select(seed, f.snapshot, ["text"], 20, "quality", {taskClass: "small"});
    assert.equal(result.selection?.providerId, "qwen-consumer");
    assert.equal(result.diagnostic.reason, "EXPLICIT_PROVIDER_PRIORITY");
  }
  f.config.routing.providerPriorities = {};
  f.config.routing.selectionPolicy = "priority";
  assert.equal(f.ladder.select(seed, f.snapshot, ["text"], 20, "quality", {taskClass: "small"}).diagnostic.reason, "PROVIDER_ORDER_PRIORITY");
});

test("selected model succeeds without artificial fallback; failed pinned model never escapes the pin", async () => {
  const f = fixture(), audit = {fallbackAttempts: [], policyDecisions: [], routingDiagnostics: [] as RoutingDiagnostic[]};
  const selected = {...seed, providerId: "kimi-consumer", modelId: "b"};
  const result = await f.ladder.run(selected, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), audit, "worker", async s => s.modelId, "quality", {taskClass: "small"});
  assert.equal(result.value, "b");
  assert.equal(audit.fallbackAttempts.length, 0);
  await assert.rejects(f.ladder.run(selected, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), audit, "worker", async () => {throw Error("failure");}, "quality", {taskClass: "small", pin: selected}));
});

test("in-flight browser concurrency excludes that provider and releases capacity", async () => {
  const f = fixture(), audit = {fallbackAttempts: [], policyDecisions: []};
  for (const model of f.snapshot.models) if (model.providerId === "qwen-consumer") model.route.maxConcurrentRequests = 1;
  let release!: () => void;
  const pending = f.ladder.run({...seed, providerId: "qwen-consumer"}, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), audit, "worker", () => new Promise<void>(resolve => {release = resolve;}), "quality", {taskClass: "small"});
  const during = f.ladder.diagnostics(seed, f.snapshot, ["text"], 20, {taskClass: "small"});
  assert.ok(during.candidates.filter(c => c.providerId === "qwen-consumer").every(c => c.reasons.includes("CONCURRENCY_LIMIT")));
  release(); await pending;
  // Releasing the call must clear capacity even if another independent
  // fail-closed gate (for example fresh provider confirmation) still applies.
  assert.ok(f.ladder.diagnostics(seed, f.snapshot, ["text"], 20, {taskClass: "small"}).candidates.filter(c => c.providerId === "qwen-consumer").every(c => !c.reasons.includes("CONCURRENCY_LIMIT")));
});

test("rate-limited candidates fall back with reason codes, cool down, then recover", async () => {
  const f = fixture(), audit = {fallbackAttempts: [] as Array<{providerId: string; modelId: string; outcome: string}>, policyDecisions: [] as string[], routingDiagnostics: [] as RoutingDiagnostic[]};
  f.providers.get("groq")!.classifyError = () => ({category: "rate_limit", message: "not retained", retryable: true, retryAfterMs: 60000, providerStatus: 429});
  const calls: string[] = [];
  const result = await f.ladder.run(seed, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), audit, "worker", async selection => {
    calls.push(selection.providerId);
    if (selection.providerId === "groq") throw Error("CONTENT_MUST_NOT_ENTER_DIAGNOSTICS");
    return "ok";
  }, "quality", {taskClass: "small"});
  assert.deepEqual(calls, ["groq", "groq", "qwen-consumer"]);
  assert.equal(result.selection.providerId, "qwen-consumer");
  assert.equal(audit.routingDiagnostics[0]?.reason, "FALLBACK_AFTER_FAILURE");
  assert.ok(audit.fallbackAttempts.some(a => a.outcome === "worker: rate_limit"));
  const next = f.ladder.select(seed, f.snapshot, ["text"], 20, "quality", {taskClass: "small"});
  assert.notEqual(next.selection?.providerId, "groq");
  assert.ok(next.diagnostic.candidates.filter(c => c.providerId === "groq").every(c => c.reasons.includes("COOLDOWN")));
  assert.doesNotMatch(JSON.stringify(audit), /CONTENT_MUST_NOT_ENTER_DIAGNOSTICS/);
  f.advance();
  assert.ok(f.ladder.diagnostics(seed, f.snapshot, ["text"], 20, {taskClass: "small"}).candidates.find(c => c.providerId === "groq")?.eligible);
});

test("router preserves diversity through execution and persists content-free diagnostics including failed pins", async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "omni-diversity-"));
  try {
    const audit = new AuditStore(join(root, "routes.jsonl"));
    const router = new OmniRouter({config: f.config, providers: f.providers, registry: async () => f.snapshot, audit, logger: new JsonlLogger(join(root, "logs.jsonl"))});
    const request = {prompt: "Explain a closure. CONTENT_SENTINEL_793", sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: 100, privacyMode: null, metadata: {}};
    const counts: Record<string, number> = {};
    for (let i = 0; i < 9; i++) {
      const result = await router.route(request, AbortSignal.timeout(5000));
      counts[result.attribution.worker.providerId] = (counts[result.attribution.worker.providerId] ?? 0) + 1;
      assert.equal(result.attribution.fallbacksAttempted.length, 0);
    }
    assert.deepEqual(counts, {groq: 3, "qwen-consumer": 3, "kimi-consumer": 3});
    const concurrent = await Promise.all(Array.from({length: 3}, () => router.route(request, AbortSignal.timeout(5000))));
    assert.equal(new Set(concurrent.map(r => r.attribution.worker.providerId)).size, 3);
    await assert.rejects(router.route({...request, selectionPin: {providerId: "missing"}}, AbortSignal.timeout(5000)));
    assert.equal((await audit.recent(1))[0]?.status, "failed");
    assert.doesNotMatch(await readFile(join(root, "routes.jsonl"), "utf8"), /CONTENT_SENTINEL_793/);
  } finally {await rm(root, {recursive: true, force: true});}
});

test("bounded packets execute without a swarm and suppress oversized or coupled delegation", async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "omni-packet-"));
  try {
    const router = new OmniRouter({config: f.config, providers: f.providers, registry: async () => f.snapshot, audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "logs.jsonl"))});
    const taskPacket: WorkerTaskPacket = {objective: "Explain a closure", excerpts: [], constraints: [], acceptanceCriteria: ["One clear example"], requestedOutput: "A concise explanation", independent: true, worthwhile: true, responseTokens: 128, instructionReserveTokens: 256, synthesisReserveTokens: 512};
    const request = {prompt: "UNRELATED_CANONICAL_CONTEXT", taskPacket, sourceClient: "regular-mcp", hostApplication: "Codex", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: null, privacyMode: null, metadata: {workerTextOnly: "true"}};
    const result = await router.route(request, AbortSignal.timeout(5000));
    assert.equal(result.plan.executionMode, "direct");
    assert.ok(result.attribution.policyDecisions.includes("BOUNDED_DELEGATION_READY"));
    assert.doesNotMatch(f.providers.get("groq")!.calls[0]!.prompt, /UNRELATED_CANONICAL_CONTEXT/);
    await assert.rejects(router.route({...request, taskPacket: {...taskPacket, instructionReserveTokens: 40000}}, AbortSignal.timeout(5000)));
    await assert.rejects(router.route({...request, taskPacket: {...taskPacket, independent: false}}, AbortSignal.timeout(5000)));
    assert.equal([...f.providers.values()].reduce((n, p) => n + p.calls.length, 0), 1);
  } finally {await rm(root, {recursive: true, force: true});}
});
