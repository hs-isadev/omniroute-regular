import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_CONFIG, EXTRA_FREE_PROVIDERS, getRuntimePaths, loadConfig, validateConfig } from "@omniroute/config";
import { createConfiguredProvider, createProviders, buildRegistry } from "@omniroute/providers";
import { configureProvider } from "../apps/cli/src/provider-management.js";

const request = (modelId: string) => ({ modelId, prompt: "Hi", instructions: "Reply briefly", reasoningEffort: "none" as const, maxOutputTokens: 16, jsonSchema: null, schemaName: null, safetyIdentifier: null, signal: AbortSignal.timeout(5000) });

test("Claude consumer is a credential-free, small-task-only provider profile", () => {
  const settings = DEFAULT_CONFIG.providers.find((provider) => provider.id === "claude-consumer");
  assert.ok(settings);
  assert.equal(settings.type, "mcp-stdio");
  assert.equal(settings.credentialField, null);
  assert.equal(settings.freeTierOnly, true);
  assert.equal(settings.maxTaskClass, "small");
  assert.deepEqual(settings.models.map((model) => model.modelId), ["claude-web-consumer"]);

  const config = structuredClone(DEFAULT_CONFIG);
  const enabled = config.providers.find((provider) => provider.id === "claude-consumer")!;
  enabled.enabled = true;
  enabled.mcpCommand = "node";
  enabled.mcpArgs = ["adapter.js", "mcp"];
  validateConfig(config);
  assert.ok(createProviders(config, { credentials: {}, mcpToolCaller: async () => ({ content: [] }) }).has("claude-consumer"));

  enabled.mcpArgs = [];
  assert.throws(() => validateConfig(config), /requires a command and arguments/);
});

test("Z.AI web consumer is distinct from the API-key provider and restricted to small tasks", () => {
  const browser = DEFAULT_CONFIG.providers.find((provider) => provider.id === "zai-consumer");
  const api = DEFAULT_CONFIG.providers.find((provider) => provider.id === "zai");
  assert.ok(browser);
  assert.ok(api);
  assert.equal(browser.type, "mcp-stdio");
  assert.equal(browser.credentialField, null);
  assert.equal(browser.freeTierOnly, true);
  assert.equal(browser.maxTaskClass, "small");
  assert.deepEqual(browser.models.map((model) => model.modelId), ["glm-web-consumer"]);
  assert.equal(api.type, "openai-compatible");
  assert.equal(api.credentialField, "ZAI_API_KEY");
  assert.notEqual(browser.id, api.id);

  const config = structuredClone(DEFAULT_CONFIG);
  const enabled = config.providers.find((provider) => provider.id === "zai-consumer")!;
  enabled.enabled = true;
  enabled.mcpCommand = "node";
  enabled.mcpArgs = ["zai-adapter.js", "mcp"];
  validateConfig(config);
  assert.ok(createProviders(config, { credentials: {}, mcpToolCaller: async () => ({ content: [] }) }).has("zai-consumer"));
});

test("strict-free catalog includes current no-card Cerebras and SambaNova API tiers", () => {
  const expected = [
    { id: "cerebras", field: "CEREBRAS_API_KEY", base: "https://api.cerebras.ai/", models: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507", "zai-glm-4.7"] },
    { id: "sambanova", field: "SAMBANOVA_API_KEY", base: "https://api.sambanova.ai/", models: ["gpt-oss-120b"] },
  ];
  for (const item of expected) {
    const profile = EXTRA_FREE_PROVIDERS.find((candidate) => candidate.id === item.id);
    assert.ok(profile, `${item.id} profile missing`);
    assert.equal(profile.credentialField, item.field);
    assert.equal(profile.baseUrl, item.base);
    assert.deepEqual(profile.modelIds, item.models);
    assert.equal(profile.access, "free-tier");
  }
  assert.equal(EXTRA_FREE_PROVIDERS.some((profile) => profile.id === "github-models"), false, "retired GitHub Models must not be offered");
});

test("all hosted profiles require confirmation and missing keys never create adapters", () => {
  const config = structuredClone(DEFAULT_CONFIG);
  assert.equal(createProviders(config, { credentials: {} }).size, 0);
  for (const profile of EXTRA_FREE_PROVIDERS) {
    assert.throws(() => configureProvider(config, profile.id, { enabled: true }), /free-only|free tier|free-only billing/i);
    configureProvider(config, profile.id, { enabled: true, confirmFreeTier: true });
  }
  validateConfig(config);
  assert.equal(createProviders(config, { credentials: {} }).size, 0);
  for (const profile of EXTRA_FREE_PROVIDERS) {
    const settings = config.providers.find((item) => item.id === profile.id)!;
    settings.freeTierConfirmed = false;
    assert.throws(() => validateConfig(config), /confirmation/);
    settings.freeTierConfirmed = true;
  }
  assert.throws(() => configureProvider(config, "anthropic", { enabled: true, confirmFreeTier: true }), /only enables free/);
});

for (const profile of EXTRA_FREE_PROVIDERS) test(`${profile.id}: authenticated discovery, generation and streaming use its own endpoint`, async () => {
  const config = structuredClone(DEFAULT_CONFIG);
  configureProvider(config, profile.id, { enabled: true, confirmFreeTier: true });
  const settings = config.providers.find((item) => item.id === profile.id)!;
  const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  const account = "a".repeat(32);
  const fetchImpl: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer fake-catalog-key");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), body });
    if (body?.stream) return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n');
    if (body) return Response.json({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 4, completion_tokens: 1 } });
    if (profile.id === "cohere") return Response.json({ models: profile.modelIds.map((name) => ({ name })) });
    if (profile.id === "cloudflare") return Response.json({ success: true, result: profile.modelIds.map((name) => ({ name })) });
    return Response.json({ data: profile.modelIds.map((id) => ({ id })) });
  };
  const provider = createConfiguredProvider(settings, { [profile.credentialField]: "fake-catalog-key", CLOUDFLARE_ACCOUNT_ID: account }, { fetchImpl, skipDnsValidationForTests: true });
  assert.equal((await provider.healthCheck()).status, "healthy");
  assert.deepEqual((await provider.listModels()).map((item) => item.id), profile.modelIds);
  assert.equal((await provider.generate(request(profile.modelIds[0]!))).text, "ok");
  const events = [];
  for await (const event of provider.stream(request(profile.modelIds[0]!))) events.push(event);
  assert.ok(events.some((event) => event.type === "delta" && event.text === "ok"));
  const generation = calls.find((call) => call.body?.stream === false)!;
  const prefix = profile.id === "cloudflare" ? `client/v4/accounts/${account}/ai/v1/` : profile.apiPrefix;
  assert.equal(generation.url, `${profile.baseUrl}${prefix}chat/completions`);
  assert.equal(generation.body?.model, profile.modelIds[0]);
  assert.equal(calls.find((call) => call.body?.stream)?.body?.stream_options, undefined);
  const registry = await buildRegistry(config, new Map([[profile.id, provider]]));
  assert.ok(registry.models.some((model) => model.providerId === profile.id && model.allowed && model.health.status === "healthy"));
});

test("Cloudflare rejects path injection and missing account IDs before network", () => {
  const settings = structuredClone(DEFAULT_CONFIG.providers.find((item) => item.id === "cloudflare")!);
  settings.freeTierConfirmed = true;
  for (const account of ["", "../other", "a".repeat(33)]) assert.throws(() => createConfiguredProvider(settings, { CLOUDFLARE_API_TOKEN: "fake", CLOUDFLARE_ACCOUNT_ID: account }), /account ID/);
});

test("Z.AI health does not disable smaller models when its first model is rate-limited", async () => {
  const config = structuredClone(DEFAULT_CONFIG);
  configureProvider(config, "zai", { enabled: true, confirmFreeTier: true });
  const calls: string[] = [];
  const provider = createConfiguredProvider(config.providers.find((item) => item.id === "zai")!, { ZAI_API_KEY: "fake-zai-key" }, { skipDnsValidationForTests: true, fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body.model);
    return calls.length === 1 ? new Response("limited", { status: 429 }) : Response.json({ choices: [{ message: { content: "ok" } }] });
  } });
  assert.equal((await provider.healthCheck()).status, "healthy");
  assert.deepEqual(calls, ["glm-4.7-flash", "glm-4.5-flash"]);
});

test("local providers require an explicit model and actual context capacity", () => {
  for (const id of ["ollama", "lmstudio", "llamacpp"]) {
    const config = structuredClone(DEFAULT_CONFIG);
    assert.throws(() => configureProvider(config, id, { enabled: true }), /explicit local model/);
    assert.throws(() => configureProvider(config, id, { enabled: true, modelId: "local-test", contextTokens: 100 }), /context/);
    configureProvider(config, id, { enabled: true, modelId: "local-test", contextTokens: 16384, coding: true });
    assert.ok(createProviders(config, { credentials: {} }).has(id));
    assert.equal(config.providers.find((item) => item.id === id)?.models[0]?.capabilities.coding, true);
  }
});

test("existing config gains new opt-in providers without enabling them or replacing user models", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-catalog-migrate-"));
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.providers = config.providers.filter((item) => ["openrouter", "gemini", "groq", "ollama"].includes(item.id));
    config.providers.find((item) => item.id === "groq")!.models[0]!.enabled = false;
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    const loaded = await loadConfig(getRuntimePaths(root));
    for (const profile of EXTRA_FREE_PROVIDERS) assert.equal(loaded.providers.find((item) => item.id === profile.id)?.enabled, false);
    assert.equal(loaded.providers.find((item) => item.id === "groq")!.models[0]!.enabled, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
