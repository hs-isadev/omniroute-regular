import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { OmniRouter } from "@omniroute/core";
import { EXTRA_FREE_PROVIDERS } from "@omniroute/config";
import { buildRegistry } from "@omniroute/providers";
import { configureProvider } from "../apps/cli/src/provider-management.js";
import { AuditStore, JsonlLogger, SafeError } from "@omniroute/observability";
import { MockProvider } from "@omniroute/testing";
import { configFixture, freeConfigFixture, lunaFixture, modelFixture, planFixture, registryFixture } from "./helpers.js";

function request(prompt = "Explain this focused design.") {
  return { prompt, sourceClient: "test", hostApplication: "standalone-test", hostModel: "untrusted-host-model", hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: null, privacyMode: null, metadata: {} } as const;
}

for (const profile of EXTRA_FREE_PROVIDERS) for (const mode of ["regular", "orchestrator"] as const) test(`${profile.id} participates in ${mode} routing through the shared registry`, async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-shared-pool-"));
  try {
    const config = freeConfigFixture();
    configureProvider(config, profile.id, { enabled: true, confirmFreeTier: true });
    config.routing.directProviderOrder = [profile.id, "openrouter"];
    const worker = new MockProvider(profile.id);
    const planner = new MockProvider("openrouter");
    worker.responses.push({ text: `${profile.id} answer` });
    planner.responses.push({ text: JSON.stringify(planFixture({ primary: { providerId: profile.id, modelId: profile.modelIds[0]!, reasoningEffort: "none", maxOutputTokens: 100 } })) });
    const providers = new Map([[worker.id, worker], [planner.id, planner]]);
    const registry = await buildRegistry(config, providers);
    const router = new OmniRouter({ config, providers, registry: async () => registry, audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route({ ...request(), routingMode: mode, maxOutputTokens: 100 }, AbortSignal.timeout(5000));
    assert.equal(result.attribution.worker.providerId, profile.id);
    assert.equal(result.answer, `${profile.id} answer`);
    assert.equal(planner.calls.length, mode === "regular" ? 0 : 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Sol plans and attributed worker answers; untrusted host model is not recorded", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-"));
  try {
    const provider = new MockProvider("openai");
    provider.responses.push({ text: JSON.stringify(planFixture()) }, { text: "worker answer" });
    const config = configFixture();
    config.budgets.taskClassMaximum.small = 10;
    const audit = new AuditStore(join(root, "routes.jsonl"));
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit, logger: new JsonlLogger(join(root, "log.jsonl")) });
    const events: string[] = [];
    const result = await router.route(request(), new AbortController().signal, (event) => events.push(event.type));
    assert.equal(result.answer, "worker answer");
    assert.equal(result.attribution.orchestrator.modelId, "gpt-5.6-sol");
    assert.equal(result.attribution.worker.modelId, "gpt-5.6-luna");
    assert.equal(result.attribution.hostModel, null);
    assert.match(result.badge, /gpt-5\.6-sol/);
    assert.ok(events.includes("worker.delta"));
    assert.equal((await audit.recent(1))[0]?.routeId, result.routeId);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("regular mode bypasses orchestration and deterministically selects the preferred free healthy worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-regular-free-"));
  try {
    const gemini = new MockProvider("gemini");
    const groq = new MockProvider("groq");
    gemini.responses.push({ text: "direct free answer" });
    const config = freeConfigFixture();
    config.routing.directProviderOrder = ["gemini", "groq"];
    const geminiModel = modelFixture({ providerId: "gemini", modelId: "gemini-3.7-flash", name: "Gemini Flash", pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null } });
    const groqModel = modelFixture({ providerId: "groq", modelId: "groq/free", name: "Groq Free", pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null } });
    const router = new OmniRouter({ config, providers: new Map([[gemini.id, gemini], [groq.id, groq]]), registry: async () => registryFixture([groqModel, geminiModel]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route({ ...request(), routingMode: "regular" }, new AbortController().signal);
    assert.equal(result.answer, "direct free answer");
    assert.equal(result.attribution.orchestrator.modelId, "deterministic-direct");
    assert.deepEqual(result.attribution.worker, { providerId: "gemini", modelId: "gemini-3.7-flash", reasoningEffort: "none", maxOutputTokens: 2048 });
    assert.equal(groq.calls.length, 0);
    assert.equal(gemini.calls.length, 1);
    assert.ok(result.attribution.policyDecisions.includes("regular mode bypassed model orchestration"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("regular routing prefers Claude consumer for small work but excludes it from medium work", async () => {
  const run = async (prompt: string): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), "omniroute-claude-scope-"));
    try {
      const claude = new MockProvider("claude-consumer");
      const groq = new MockProvider("groq");
      claude.responses.push({ text: "claude answer" });
      groq.responses.push({ text: "groq answer" });
      const config = freeConfigFixture();
      for (const provider of config.providers) provider.enabled = ["claude-consumer", "groq"].includes(provider.id);
      config.routing.directProviderOrder = ["claude-consumer", "groq"];
      const claudeModel = modelFixture({ providerId: "claude-consumer", modelId: "claude-web-consumer", contextWindow: 32_768, maxOutputTokens: 4_096, reasoningEfforts: ["none"], capabilities: { text: true, coding: true, toolCalling: false, structuredOutput: false, web: false }, pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null } });
      const groqModel = modelFixture({ providerId: "groq", modelId: "openai/gpt-oss-120b", pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null } });
      const router = new OmniRouter({ config, providers: new Map([[claude.id, claude], [groq.id, groq]]), registry: async () => registryFixture([claudeModel, groqModel]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
      return (await router.route({ ...request(prompt), routingMode: "regular" }, AbortSignal.timeout(5000))).attribution.worker.providerId;
    } finally { await rm(root, { recursive: true, force: true }); }
  };

  assert.equal(await run("Summarize this short paragraph."), "claude-consumer");
  assert.equal(await run("Provide:\n1. One focused answer\n2. A second answer\n3. A combined final answer"), "groq");
});

test("orchestrator mode uses the configured non-Sol free orchestrator", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-free-orchestrator-"));
  try {
    const groq = new MockProvider("groq");
    const gemini = new MockProvider("gemini");
    groq.responses.push({ text: JSON.stringify(planFixture({ primary: { providerId: "gemini", modelId: "gemini-free", reasoningEffort: "none", maxOutputTokens: 100 } })) });
    gemini.responses.push({ text: "orchestrated free answer" });
    const config = freeConfigFixture();
    config.routing.defaultMode = "orchestrator";
    config.routing.orchestratorProviderId = "groq";
    config.routing.orchestratorModelId = "groq-orchestrator";
    const orchestratorModel = modelFixture({ providerId: "groq", modelId: "groq-orchestrator", name: "Groq Free Orchestrator", pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null } });
    const workerModel = modelFixture({ providerId: "gemini", modelId: "gemini-free", name: "Gemini Free Worker", pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0, updatedAt: null } });
    const router = new OmniRouter({ config, providers: new Map([[groq.id, groq], [gemini.id, gemini]]), registry: async () => registryFixture([orchestratorModel, workerModel]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route(request(), new AbortController().signal);
    assert.equal(result.answer, "orchestrated free answer");
    assert.deepEqual(result.attribution.orchestrator, { providerId: "groq", modelId: "groq-orchestrator", reasoningEffort: "none" });
    assert.equal(result.attribution.worker.providerId, "gemini");
    assert.equal(groq.calls.length, 1);
    assert.equal(gemini.calls.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid Sol plan gets exactly one constrained repair", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-repair-"));
  try {
    const provider = new MockProvider("openai");
    provider.responses.push({ text: JSON.stringify({ invalid: true }) }, { text: JSON.stringify(planFixture()) }, { text: "repaired answer" });
    const config = configFixture(); config.budgets.taskClassMaximum.small = 10;
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route(request(), new AbortController().signal);
    assert.equal(result.answer, "repaired answer");
    assert.equal(provider.calls.filter((call) => call.modelId === "gpt-5.6-sol").length, 2);
    assert.ok(result.attribution.policyDecisions.some((item) => item.includes("repair")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an invalid plan cannot start its repair outside the reserved per-request budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-repair-budget-"));
  try {
    const provider = new MockProvider("openai");
    provider.responses.push({ text: JSON.stringify({ invalid: true }) }, { text: JSON.stringify(planFixture()) });
    const config = configFixture();
    config.reliability.retryLimit = 0;
    config.budgets.perRequestUsd = 0.13;
    config.budgets.taskClassMaximum.small = 10;
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    await assert.rejects(router.route(request(), new AbortController().signal), (error: unknown) => error instanceof SafeError && error.code === "PER_REQUEST_BUDGET_EXCEEDED");
    assert.equal(provider.calls.length, 1, "the initial invalid plan may run, but its unreserved repair must not start");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("orchestration fails closed when exact Sol is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-nosol-"));
  try {
    const provider = new MockProvider("openai");
    const router = new OmniRouter({ config: configFixture(), providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    await assert.rejects(router.route(request(), new AbortController().signal), (error: unknown) => error instanceof SafeError && error.code === "ORCHESTRATION_UNAVAILABLE");
    assert.equal(provider.calls.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("prompt content is not persisted in audit or log by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-content-"));
  try {
    const provider = new MockProvider("openai");
    provider.responses.push({ text: JSON.stringify(planFixture()) }, { text: "safe answer" });
    const config = configFixture(); config.budgets.taskClassMaximum.small = 10;
    const auditPath = join(root, "routes.jsonl"), logPath = join(root, "log.jsonl");
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit: new AuditStore(auditPath), logger: new JsonlLogger(logPath) });
    const unique = "PROMPT_CONTENT_MUST_NOT_PERSIST_7f8a";
    await router.route(request(unique), new AbortController().signal);
    assert.doesNotMatch(await readFile(auditPath, "utf8"), new RegExp(unique));
    assert.doesNotMatch(await readFile(logPath, "utf8"), new RegExp(unique));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("worker context limits are enforced before provider execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-context-"));
  try {
    const provider = new MockProvider("openai");
    provider.responses.push({ text: JSON.stringify(planFixture({ primary: { providerId: "openai", modelId: "gpt-5.6-luna", reasoningEffort: "low", maxOutputTokens: 100 } })) });
    const constrained = lunaFixture({ contextWindow: 120, maxOutputTokens: 1_000 });
    const config = configFixture(); config.budgets.taskClassMaximum.small = 10;
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), constrained]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    await assert.rejects(router.route(request("x".repeat(1_000)), new AbortController().signal), (error: unknown) => error instanceof SafeError && error.code === "CONTEXT_LIMIT_EXCEEDED");
    assert.equal(provider.calls.length, 1, "only the Sol planning call may execute");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("explicit emergency fallback is attributed and never silent", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-fallback-"));
  try {
    const provider = new MockProvider("openai");
    const plan = planFixture({ fallbacks: [{ providerId: "openai", modelId: "gpt-5.6-sol", reasoningEffort: "low", maxOutputTokens: 500 }] });
    provider.responses.push({ text: JSON.stringify(plan) }, { text: "", error: new Error("primary unavailable") }, { text: "fallback answer" });
    const config = configFixture(); config.routing.emergencyFallbackEnabled = true; config.budgets.taskClassMaximum.small = 10;
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const result = await router.route(request(), new AbortController().signal);
    assert.equal(result.answer, "fallback answer");
    assert.equal(result.attribution.worker.modelId, "gpt-5.6-sol");
    assert.equal(result.attribution.fallbacksAttempted.length, 2);
    assert.match(result.badge, /worker: openai\/gpt-5\.6-sol/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("client cancellation propagates to a started provider response", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-cancel-"));
  const controller = new AbortController();
  class CancellingProvider extends MockProvider {
    override async *stream(): AsyncGenerator<import("@omniroute/providers").ProviderStreamEvent> {
      yield { type: "start", responseId: "worker-response-id" };
      controller.abort(new DOMException("client disconnected", "AbortError"));
      throw new DOMException("client disconnected", "AbortError");
    }
  }
  try {
    const provider = new CancellingProvider("openai");
    provider.responses.push({ text: JSON.stringify(planFixture()) });
    const config = configFixture(); config.budgets.taskClassMaximum.small = 10;
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    await assert.rejects(router.route(request(), controller.signal), /client disconnected/);
    assert.deepEqual(provider.cancelled, ["worker-response-id"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("planner cannot omit a deterministically required capability", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-capability-"));
  try {
    const provider = new MockProvider("openai");
    provider.responses.push(
      { text: JSON.stringify(planFixture({ requiredCapabilities: ["text"] })) },
      { text: JSON.stringify(planFixture({ requiredCapabilities: ["text", "vision"] })) },
      { text: "vision answer" },
    );
    const config = configFixture(); config.budgets.taskClassMaximum.small = 10;
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    const visionRequest = { ...request("Describe the attachment."), attachments: [{ name: "screen.png", mediaType: "image/png", size: 1_000 }] };
    const result = await router.route(visionRequest, new AbortController().signal);
    assert.equal(result.answer, "vision answer");
    assert.ok(result.plan.requiredCapabilities.includes("vision"));
    assert.ok(result.attribution.policyDecisions.some((decision) => decision.includes("repair")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review-and-revision cost is validated before worker execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-review-budget-"));
  try {
    const provider = new MockProvider("openai");
    provider.responses.push({ text: JSON.stringify(planFixture({ review: { required: true, providerId: "openai", modelId: "gpt-5.6-luna", criteria: ["correctness"] } })) });
    const config = configFixture(); config.budgets.perRequestUsd = 0.0065; config.budgets.taskClassMaximum.small = 10; config.routing.repairInvalidPlanOnce = false; config.reliability.retryLimit = 0;
    const inexpensiveSol = modelFixture({ pricing: { inputPerMillionUsd: 0.01, outputPerMillionUsd: 0.01, cachedInputPerMillionUsd: 0.001, updatedAt: null } });
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([inexpensiveSol, lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    await assert.rejects(router.route(request(), new AbortController().signal), (error: unknown) => error instanceof SafeError && error.code === "ROUTING_PLAN_INVALID" && /budget/.test(error.message));
    assert.equal(provider.calls.length, 1, "no draft, review, or revision call may start after budget rejection");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("partial streaming failure is surfaced and does not invoke a fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-router-partial-"));
  class PartialProvider extends MockProvider {
    workerStreams = 0;
    override async *stream(): AsyncGenerator<import("@omniroute/providers").ProviderStreamEvent> {
      this.workerStreams += 1;
      yield { type: "start", responseId: "partial-worker" };
      yield { type: "delta", text: "partial text" };
      throw new SafeError("PROVIDER_STREAM_TRUNCATED", "stream truncated");
    }
  }
  try {
    const provider = new PartialProvider("openai");
    provider.responses.push({ text: JSON.stringify(planFixture({ fallbacks: [{ providerId: "openai", modelId: "gpt-5.6-sol", reasoningEffort: "low", maxOutputTokens: 500 }] })) });
    const config = configFixture(); config.routing.emergencyFallbackEnabled = true; config.budgets.taskClassMaximum.small = 10;
    const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit: new AuditStore(join(root, "routes.jsonl")), logger: new JsonlLogger(join(root, "log.jsonl")) });
    await assert.rejects(router.route(request(), new AbortController().signal), (error: unknown) => error instanceof SafeError && error.code === "STREAM_PARTIAL");
    assert.equal(provider.workerStreams, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
