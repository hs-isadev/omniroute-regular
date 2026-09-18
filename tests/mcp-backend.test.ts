import assert from "node:assert/strict";
import test from "node:test";
import { createCliMcpBackend } from "../apps/cli/dist/mcp-backend.js";

test("MCP host cancellation is threaded into the authenticated daemon request", async () => {
  let receivedSignal: AbortSignal | null = null;
  const client = {
    request: async <T>(_path: string, init: RequestInit = {}) => {
      receivedSignal = init.signal as AbortSignal;
      await new Promise<void>((_resolve, reject) => receivedSignal!.addEventListener("abort", () => reject(receivedSignal!.reason), { once: true }));
      return null as T;
    },
    models: async () => [],
    recentRoutes: async () => [],
  };
  const backend = createCliMcpBackend(client);
  const controller = new AbortController();
  const pending = backend.route({ prompt: "route me", requiredCapabilities: [], hostApplication: "codex", hostModel: null, hostModelAuthoritative: false }, controller.signal);
  controller.abort(new DOMException("host cancelled", "AbortError"));
  await assert.rejects(pending, /host cancelled/);
  assert.equal(receivedSignal, controller.signal);
});

test("regular-locked MCP rejects orchestrator requests and forces regular when omitted", async () => {
  const bodies: string[] = [];
  const client = {
    request: async <T>(_path: string, init: RequestInit = {}) => {
      bodies.push(String(init.body));
      return null as T;
    },
    models: async () => [],
    recentRoutes: async () => [],
  };
  const backend = createCliMcpBackend(client, "regular");
  const base = { prompt: "route me", requiredCapabilities: [], hostApplication: "opencode", hostModel: null, hostModelAuthoritative: false };
  assert.throws(() => backend.route({ ...base, routingMode: "orchestrator" }), /MCP host is locked to regular mode/);
  await backend.route(base);
  assert.equal(JSON.parse(bodies[0]!).routingMode, "regular");
});

test("MCP task lifecycle calls map to the local daemon task endpoints", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const client = { request: async <T>(path: string, init: RequestInit = {}) => { calls.push({ path, init }); return {} as T; }, models: async () => [], recentRoutes: async () => [], usageSummary: async () => ({}) };
  const backend = createCliMcpBackend(client);
  await backend.tasks!.submit({ objective: "task", constraints: [], contextReferences: [], requiredCapabilities: ["text"], approvedTools: [], budget: { maxAttempts: 1, maxOutputTokens: 1, maxLatencyMs: 1, maxCostUsd: 0 }, stopConditions: [], acceptanceCriteria: [], idempotencyKey: "key" });
  await backend.tasks!.verify("task-abc", { check: "test", status: "passed", summary: "ok" });
  assert.equal(calls[0]?.path, "/v1/tasks");
  assert.equal(calls[1]?.path, "/v1/tasks/task-abc/verify");
});
