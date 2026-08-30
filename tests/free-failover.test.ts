import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ModelSelection, ProviderErrorShape } from "@omniroute/contracts";
import { OmniRouter } from "@omniroute/core";
import { AuditStore, JsonlLogger, SafeError } from "@omniroute/observability";
import { OpenAICompatibleProvider, ProviderHttpError } from "@omniroute/providers";
import { MockProvider } from "@omniroute/testing";
import { FreeModelFailover } from "../packages/core/src/free-failover.js";
import { freeConfigFixture, modelFixture, planFixture, registryFixture } from "./helpers.js";

class LimitProvider extends MockProvider {
  override classifyError(error: unknown): ProviderErrorShape { return new OpenAICompatibleProvider({ id: this.id, baseUrl: "https://example.com" }).classifyError(error); }
}
const limited = (id = "groq", delay = 1000) => new ProviderHttpError(id, 429, delay, "rate limited");
const primary: ModelSelection = { providerId: "groq", modelId: "small", reasoningEffort: "none", maxOutputTokens: 100 };
function fixture() {
  const config = freeConfigFixture();
  config.reliability.retryLimit = 0;
  config.routing.directProviderOrder = ["groq", "gemini", "openrouter"];
  const models = ["groq", "gemini", "openrouter"].flatMap((providerId) => ["big", "small"].map((modelId) => modelFixture({ providerId, modelId: providerId === "openrouter" && modelId === "big" ? "openrouter/free" : modelId, intelligenceTier: modelId === "big" ? 5 : 2, maxOutputTokens: 4096, contextWindow: 32768, reasoningEfforts: ["none", "low"], capabilities: { text: true, imageInput: false, imageOutput: false, audioInput: false, audioOutput: false, coding: true, toolCalling: false, structuredOutput: providerId === "openrouter", web: false }, pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null } })));
  const providers = new Map(["groq", "gemini", "openrouter"].map((id) => [id, new LimitProvider(id)]));
  return { config, models, snapshot: registryFixture(models), providers, audit: { fallbackAttempts: [], policyDecisions: [] } };
}

test("model ladder upgrades to best on the selected provider, exhausts its smaller models, then changes provider", async () => {
  const f = fixture(), calls: string[] = [];
  const ladder = new FreeModelFailover(f.config, f.providers);
  const result = await ladder.run(primary, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), f.audit, "worker", async (selection) => {
    calls.push(`${selection.providerId}/${selection.modelId}`);
    if (selection.providerId === "groq") throw limited();
    return "ok";
  });
  assert.deepEqual(calls, ["groq/big", "groq/small", "gemini/big"]);
  assert.equal(result.selection.providerId, "gemini");
  assert.equal(f.audit.fallbackAttempts.length, 3);
});

test("429 cooldown is model-specific, persists between routes and expires using Retry-After", async () => {
  const f = fixture(); let now = 10000;
  const ladder = new FreeModelFailover(f.config, f.providers, () => now);
  await ladder.run(primary, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), f.audit, "worker", async (selection) => { if (selection.modelId === "big") throw limited("groq", 2000); return "small"; });
  assert.equal(ladder.candidates(primary, f.snapshot, ["text"], 20)[0]?.modelId, "small");
  now += 2001;
  assert.equal(ladder.candidates(primary, f.snapshot, ["text"], 20)[0]?.modelId, "big");
});

test("HTTP 413 token quota tries the smaller same-provider model next", async () => {
  const f = fixture(), calls: string[] = [];
  const result = await new FreeModelFailover(f.config, f.providers).run(primary, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), f.audit, "worker", async (selection) => {
    calls.push(`${selection.providerId}/${selection.modelId}`);
    if (selection.modelId === "big") throw new ProviderHttpError("groq", 413, null, JSON.stringify({ error: { code: "rate_limit_exceeded" } }));
    return "ok";
  });
  assert.deepEqual(calls, ["groq/big", "groq/small"]);
  assert.equal(result.selection.providerId, "groq");
});

test("paid, unknown-price, disabled, unhealthy, incapable and undersized alternatives are never called", () => {
  const f = fixture();
  const [big, small, otherBig, otherSmall] = f.models;
  big!.pricing.inputPerMillionUsd = 1;
  small!.pricing.inputPerMillionUsd = null;
  otherBig!.health.status = "unhealthy";
  otherSmall!.contextWindow = 110;
  f.models[4]!.enabled = false;
  f.models[5]!.capabilities.coding = false;
  const ladder = new FreeModelFailover(f.config, f.providers);
  assert.deepEqual(ladder.candidates(primary, f.snapshot, ["coding"], 20), []);
});

for (const error of [new SafeError("STREAM_PARTIAL", "partial"), new ProviderHttpError("groq", 401, null, "bad key"), new ProviderHttpError("groq", 400, null, "bad request")]) test(`no automatic retry or provider change for ${error.message}`, async () => {
  const f = fixture(); let calls = 0;
  await assert.rejects(new FreeModelFailover(f.config, f.providers).run(primary, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), f.audit, "worker", async () => { calls++; throw error; }));
  assert.equal(calls, 1);
});

test("cancelled work does not try another provider", async () => {
  const f = fixture(), abort = new AbortController(); let calls = 0;
  await assert.rejects(new FreeModelFailover(f.config, f.providers).run(primary, f.snapshot, ["text"], 20, abort.signal, f.audit, "worker", async () => { calls++; abort.abort(); throw limited(); }));
  assert.equal(calls, 1);
});

test("disabling free-model failover preserves the exact selected model", async () => {
  const f = fixture(); f.config.routing.freeModelFailoverEnabled = false;
  const result = await new FreeModelFailover(f.config, f.providers).run(primary, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), f.audit, "worker", async (selection) => selection.modelId);
  assert.equal(result.value, "small");
});

for (const mode of ["regular", "orchestrator"] as const) test(`${mode} routes downgrade on provider limits without repeating the limited model`, async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "omni-free-ladder-"));
  f.config.reliability.retryLimit = 2;
  f.config.routing.intentRoutingEnabled = false;
  f.providers.get("groq")!.responses.push({ text: "", error: limited() }, { text: "", error: limited() });
  f.providers.get("gemini")!.responses.push({ text: "second provider answer" });
  f.providers.get("openrouter")!.responses.push({ text: JSON.stringify(planFixture({ primary })) });
  try {
    const router = new OmniRouter({ config: f.config, providers: f.providers, registry: async () => f.snapshot, audit: new AuditStore(join(root, "audit.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route({ prompt: "Explain this design.", routingMode: mode, sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: 100, privacyMode: null, metadata: {} }, AbortSignal.timeout(5000));
    assert.deepEqual(f.providers.get("groq")!.calls.map((call) => call.modelId), ["big", "small"]);
    assert.equal(result.attribution.worker.providerId, "gemini");
    assert.equal(result.attribution.worker.modelId, "big");
    assert.equal(result.attribution.fallbacksAttempted.length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("free planner itself downgrades and records its actual model", async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "omni-planner-ladder-"));
  f.config.routing.intentRoutingEnabled = false;
  f.providers.get("openrouter")!.responses.push({ text: "", error: limited("openrouter") }, { text: JSON.stringify(planFixture({ primary })) });
  f.providers.get("groq")!.responses.push({ text: "answer" });
  try {
    const router = new OmniRouter({ config: f.config, providers: f.providers, registry: async () => f.snapshot, audit: new AuditStore(join(root, "audit.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route({ prompt: "Explain this design.", routingMode: "orchestrator", sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: 100, privacyMode: null, metadata: {} }, AbortSignal.timeout(5000));
    assert.deepEqual(f.providers.get("openrouter")!.calls.map((call) => call.modelId), ["openrouter/free", "small"]);
    assert.equal(result.attribution.orchestrator.modelId, "small");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("subtasks, reviewer and revision share cooldowns and preserve final attribution", async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "omni-review-ladder-"));
  f.config.routing.intentRoutingEnabled = false;
  const plan = planFixture({ primary: { ...primary, modelId: "big" }, executionMode: "decomposed", subtasks: [{ id: "analysis", goal: "Explain one tradeoff", dependencies: [], providerId: "groq", modelId: "big", reasoningEffort: "none" }], review: { required: true, providerId: "gemini", modelId: "big", criteria: ["Check accuracy"] } });
  f.providers.get("openrouter")!.responses.push({ text: JSON.stringify(plan) });
  f.providers.get("groq")!.responses.push({ text: "", error: limited("groq", 60000) }, { text: "subtask answer" }, { text: "draft answer" }, { text: "final answer" });
  f.providers.get("gemini")!.responses.push({ text: "", error: limited("gemini", 60000) }, { text: "No material issues" });
  try {
    const router = new OmniRouter({ config: f.config, providers: f.providers, registry: async () => f.snapshot, audit: new AuditStore(join(root, "audit.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route({ prompt: "Explain this design.", routingMode: "orchestrator", sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: 100, privacyMode: null, metadata: {} }, AbortSignal.timeout(5000));
    assert.deepEqual(f.providers.get("groq")!.calls.map((call) => call.modelId), ["big", "small", "small", "small"]);
    assert.deepEqual(f.providers.get("gemini")!.calls.map((call) => call.modelId), ["big", "small"]);
    assert.equal(result.answer, "final answer");
    assert.equal(result.attribution.worker.modelId, "small");
    assert.equal(result.attribution.reviewers[0]?.modelId, "small");
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const mode of ["regular", "orchestrator"] as const) test(`${mode}: casual questions stay on the light worker instead of being upgraded by failover`, async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "omni-intent-"));
  f.providers.get("openrouter")!.responses.push({ text: JSON.stringify(planFixture({ primary: { ...primary, modelId: "big" } })) });
  f.providers.get("groq")!.responses.push({ text: "short answer" });
  try {
    const router = new OmniRouter({ config: f.config, providers: f.providers, registry: async () => f.snapshot, audit: new AuditStore(join(root, "audit.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route({ prompt: "Why is the sky blue?", routingMode: mode, sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: null, privacyMode: null, metadata: {} }, AbortSignal.timeout(5000));
    assert.equal(result.attribution.worker.modelId, "small");
    assert.ok(result.attribution.policyDecisions.includes("intent casual_question; lightweight model preference"));
    if (mode === "regular") {
      assert.equal(f.providers.get("openrouter")!.calls.length, 0);
      assert.equal(result.attribution.worker.maxOutputTokens, 2048);
      assert.equal(result.attribution.worker.reasoningEffort, "none");
    } else assert.equal(result.attribution.orchestrator.modelId, "small");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("lightweight fallback stays within the provider before changing providers", async () => {
  const f = fixture(), calls: string[] = [];
  const result = await new FreeModelFailover(f.config, f.providers).run(primary, f.snapshot, ["text"], 20, AbortSignal.timeout(5000), f.audit, "worker", async selection => {
    calls.push(`${selection.providerId}/${selection.modelId}`);
    if (selection.providerId === "groq") throw limited();
    return "ok";
  }, "lightweight");
  assert.deepEqual(calls, ["groq/small", "groq/big", "gemini/small"]);
  assert.equal(result.selection.modelId, "small");
});

for (const mode of ["regular", "orchestrator"] as const) for (const prompt of ["Debug this Python code.", "Write a tiny Python function to add two numbers.", "Review this code for errors."]) test(`${mode}: coding prefers GPT OSS 120B: ${prompt}`, async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "omni-coding-intent-"));
  for (const model of f.models.filter(model => model.providerId === "groq")) model.modelId = model.modelId === "big" ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b";
  f.config.providers.find(provider => provider.id === "groq")!.freeModelOrder = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  f.providers.get("openrouter")!.responses.push({ text: JSON.stringify(planFixture({ requiredCapabilities: ["text", "coding"], primary: { ...primary, modelId: "openai/gpt-oss-20b" } })) });
  f.providers.get("groq")!.responses.push({ text: "coding answer" });
  try {
    const router = new OmniRouter({ config: f.config, providers: f.providers, registry: async () => f.snapshot, audit: new AuditStore(join(root, "audit.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route({ prompt, routingMode: mode, sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: 100, privacyMode: null, metadata: {} }, AbortSignal.timeout(5000));
    assert.equal(result.attribution.worker.modelId, "openai/gpt-oss-120b");
    assert.ok(result.attribution.policyDecisions.includes("intent coding; quality model preference"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
