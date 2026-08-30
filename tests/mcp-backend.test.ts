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
