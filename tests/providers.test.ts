import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicProvider, buildRegistry, OpenAICompatibleProvider, OpenAIProvider, ProviderHttpError, retryProviderCall } from "@omniroute/providers";
import { MockProvider } from "@omniroute/testing";
import { configFixture } from "./helpers.js";

test("OpenAI adapter uses Responses structured output with exact model and store=false", async () => {
  let body: Record<string, unknown> | null = null;
  const fetchImpl: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ id: "resp_test", output_text: '{"ok":true}', usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const provider = new OpenAIProvider({ id: "openai", baseUrl: "https://api.openai.com", apiKey: "sk-fake-test-key", fetchImpl, skipDnsValidationForTests: true });
  const result = await provider.generate({ modelId: "gpt-5.6-sol", prompt: "route", instructions: "plan", reasoningEffort: "low", maxOutputTokens: 100, jsonSchema: { type: "object" }, schemaName: "plan", signal: new AbortController().signal, safetyIdentifier: "safe-user" });
  assert.equal(result.text, '{"ok":true}');
  assert.equal(body?.model, "gpt-5.6-sol");
  assert.equal(body?.store, false);
  assert.deepEqual(body?.reasoning, { effort: "low" });
  assert.equal((body?.text as { format?: { type?: string } }).format?.type, "json_schema");
});

test("streaming adapter yields deltas and usage", async () => {
  const encoder = new TextEncoder();
  const fetchImpl: typeof fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('event: response.created\ndata: {"type":"response.created","response":{"id":"resp_s"}}\n\n'));
    controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\n'));
    controller.enqueue(encoder.encode('event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_s","usage":{"input_tokens":2,"output_tokens":1}}}\n\n'));
    controller.close();
  } }), { status: 200, headers: { "content-type": "text/event-stream" } });
  const provider = new OpenAIProvider({ id: "openai", baseUrl: "https://api.openai.com", apiKey: "sk-fake", fetchImpl, skipDnsValidationForTests: true });
  const events = [];
  for await (const event of provider.stream({ modelId: "gpt-5.6-sol", prompt: "x", instructions: "x", reasoningEffort: "low", maxOutputTokens: 10, jsonSchema: null, schemaName: null, signal: new AbortController().signal, safetyIdentifier: null })) events.push(event);
  assert.ok(events.some((event) => event.type === "delta" && event.text === "hello"));
  assert.ok(events.some((event) => event.type === "usage" && event.usage.outputTokens === 1));
});

test("Retry-After is honored only for retryable pre-output failures", async () => {
  const provider = new MockProvider("mock");
  provider.classifyError = () => ({ category: "rate_limit", message: "limited", retryable: true, retryAfterMs: 1, providerStatus: 429 });
  let calls = 0;
  const value = await retryProviderCall(provider, async () => { calls += 1; if (calls < 2) throw new ProviderHttpError("mock", 429, 1, "limited"); return "ok"; }, { retries: 2, baseDelayMs: 1, maxDelayMs: 2, signal: new AbortController().signal });
  assert.equal(value, "ok"); assert.equal(calls, 2);
});

test("model registry reflects health changes and does not enable unknown discovered models", async () => {
  const config = configFixture();
  const provider = new MockProvider("openai");
  provider.models = [{ id: "gpt-5.6-sol", name: "Sol", createdAt: null, contextWindow: null, maxOutputTokens: null, capabilities: {}, reasoningEfforts: [] }];
  let registry = await buildRegistry(config, new Map([[provider.id, provider]]));
  assert.equal(registry.models.find((model) => model.modelId === "gpt-5.6-sol")?.health.status, "healthy");
  provider.health = { status: "unhealthy", checkedAt: new Date().toISOString(), latencyMs: 1, message: "down" };
  registry = await buildRegistry(config, new Map([[provider.id, provider]]));
  assert.equal(registry.models.find((model) => model.modelId === "gpt-5.6-sol")?.health.status, "unhealthy");
});

test("Anthropic adapter uses Messages API headers and normalizes usage", async () => {
  let url = "", headers: Record<string, string> = {}, body: Record<string, unknown> = {};
  const fetchImpl: typeof fetch = async (input, init) => {
    url = String(input); headers = init?.headers as Record<string, string>; body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "msg_test", content: [{ type: "text", text: "anthropic answer" }], usage: { input_tokens: 9, output_tokens: 4, cache_read_input_tokens: 3 } }), { status: 200 });
  };
  const provider = new AnthropicProvider({ id: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "sk-ant-fake-test", fetchImpl, skipDnsValidationForTests: true });
  const result = await provider.generate({ modelId: "claude-test", prompt: "hello", instructions: "help", reasoningEffort: "none", maxOutputTokens: 50, jsonSchema: null, schemaName: null, signal: new AbortController().signal, safetyIdentifier: null });
  assert.match(url, /v1\/messages$/); assert.equal(headers["anthropic-version"], "2023-06-01"); assert.equal(body.model, "claude-test");
  assert.equal(result.text, "anthropic answer"); assert.deepEqual(result.usage, { inputTokens: 9, outputTokens: 4, cachedInputTokens: 3, estimatedCostUsd: null });
});

test("OpenAI-compatible adapter streams chat deltas and usage", async () => {
  const encoder = new TextEncoder();
  const fetchImpl: typeof fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('data: {"id":"chat_1","choices":[{"delta":{"content":"part one"}}]}\n\n'));
    controller.enqueue(encoder.encode('data: {"id":"chat_1","choices":[{"delta":{"content":" part two"}}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n'));
    controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close();
  } }), { status: 200, headers: { "content-type": "text/event-stream" } });
  const provider = new OpenAICompatibleProvider({ id: "compatible", baseUrl: "https://example.com", apiKey: "fake-key", fetchImpl, skipDnsValidationForTests: true });
  const events = [];
  for await (const event of provider.stream({ modelId: "model", prompt: "x", instructions: "x", reasoningEffort: "none", maxOutputTokens: 10, jsonSchema: null, schemaName: null, signal: new AbortController().signal, safetyIdentifier: null })) events.push(event);
  assert.equal(events.filter((event) => event.type === "delta").map((event) => event.type === "delta" ? event.text : "").join(""), "part one part two");
  assert.ok(events.some((event) => event.type === "usage" && event.usage.inputTokens === 5 && event.usage.outputTokens === 2));
});

test("OpenAI-compatible adapter honors an empty API prefix for Gemini-style endpoints", async () => {
  let url = "";
  const fetchImpl: typeof fetch = async (input) => {
    url = String(input);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const provider = new OpenAICompatibleProvider({ id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", apiPrefix: "", apiKey: "fake-gemini-key", fetchImpl, skipDnsValidationForTests: true });
  await provider.generate({ modelId: "gemini-3.7-flash", prompt: "hello", instructions: "answer", reasoningEffort: "none", maxOutputTokens: 10, jsonSchema: null, schemaName: null, signal: new AbortController().signal, safetyIdentifier: null });
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
});

test("compatible adapters surface quota errors even inside HTTP 200 JSON or SSE responses", async () => {
  for (const stream of [false, true]) {
    const provider = new OpenAICompatibleProvider({ id: "gateway", baseUrl: "https://example.com", skipDnsValidationForTests: true, fetchImpl: async () => stream ? new Response('data: {"error":{"code":"insufficient_quota"}}\n\ndata: [DONE]\n\n') : Response.json({ error: { code: "insufficient_quota" } }) });
    const request = { modelId: "free", prompt: "hi", instructions: "reply", maxOutputTokens: 10, reasoningEffort: "none" as const, signal: AbortSignal.timeout(5000), jsonSchema: null, schemaName: null, safetyIdentifier: null };
    await assert.rejects(async () => { if (stream) { for await (const _event of provider.stream(request)) {} } else await provider.generate(request); }, (error: unknown) => provider.classifyError(error).category === "rate_limit");
  }
});

test("provider stream closure without a terminal event is rejected", async () => {
  const encoder = new TextEncoder();
  const fetchImpl: typeof fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n'));
    controller.close();
  } }), { status: 200, headers: { "content-type": "text/event-stream" } });
  const provider = new OpenAIProvider({ id: "openai", baseUrl: "https://api.openai.com", apiKey: "sk-fake", fetchImpl, skipDnsValidationForTests: true });
  await assert.rejects(async () => {
    for await (const _event of provider.stream({ modelId: "gpt-5.6-sol", prompt: "x", instructions: "x", reasoningEffort: "low", maxOutputTokens: 10, jsonSchema: null, schemaName: null, signal: new AbortController().signal, safetyIdentifier: null })) { /* consume */ }
  }, /without response\.completed/);
});

test("Groq HTTP 413 quota errors trigger model failover but ordinary oversized requests do not", () => {
  const provider = new OpenAICompatibleProvider({ id: "groq", baseUrl: "https://example.com" });
  const limited = provider.classifyError(new ProviderHttpError("groq", 413, null, JSON.stringify({ error: { code: "rate_limit_exceeded", type: "tokens" } })));
  assert.equal(limited.category, "rate_limit");
  assert.equal(limited.retryable, false);
  assert.equal(provider.classifyError(new ProviderHttpError("groq", 413, null, "Payload too large")).category, "invalid_request");
});

test("Gemini model discovery normalizes resource prefixes without rewriting other providers", async () => {
  for (const id of ["gemini", "other"]) {
    const provider = new OpenAICompatibleProvider({ id, baseUrl: "https://example.com", skipDnsValidationForTests: true, fetchImpl: async () => Response.json({ data: [{ id: "models/gemini-3.7-flash" }] }) });
    assert.equal((await provider.listModels())[0]?.id, id === "gemini" ? "gemini-3.7-flash" : "models/gemini-3.7-flash");
  }
});
