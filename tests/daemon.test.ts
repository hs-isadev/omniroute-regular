import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getRuntimePaths } from "@omniroute/config";
import { OmniRouter } from "@omniroute/core";
import { AuditStore, JsonlLogger, SafeError } from "@omniroute/observability";
import { MockProvider } from "@omniroute/testing";
import type { GenerateRequest, ProviderStreamEvent } from "@omniroute/providers";
import { OmniDaemonServer } from "../apps/daemon/dist/server.js";
import { configFixture, lunaFixture, modelFixture, planFixture, registryFixture } from "./helpers.js";

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function statusWithHost(port: number, host: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path: "/v1/health", headers: { host } }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("error", reject);
    request.end();
  });
}

test("daemon enforces loopback auth, Host, one-time dashboard sessions, Origin, CSRF, and attribution", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-daemon-"));
  const port = await freePort();
  const config = configFixture();
  config.daemon.port = port;
  config.daemon.allowedOrigins = [`http://127.0.0.1:${port}`];
  config.budgets.taskClassMaximum.small = 10;
  const paths = getRuntimePaths(root);
  const provider = new MockProvider("openai");
  provider.responses.push({ text: JSON.stringify(planFixture()) }, { text: "daemon answer" });
  const registrySnapshot = registryFixture([modelFixture(), lunaFixture()]);
  const audit = new AuditStore(paths.routes), logger = new JsonlLogger(paths.log);
  const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registrySnapshot, audit, logger });
  const runtime = { config, paths, token: "local-test-token", providers: new Map([[provider.id, provider]]), registry: { current: async () => registrySnapshot }, audit, logger, router } as never;
  const daemon = new OmniDaemonServer(runtime);
  try {
    await daemon.start();
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/v1/health`)).status, 200);
    assert.equal((await fetch(`${base}/v1/models`)).status, 401);
    assert.equal(await statusWithHost(port, "evil.example"), 403);

    const bootstrap = await fetch(`${base}/v1/dashboard/session`, { method: "POST", headers: { authorization: "Bearer local-test-token", "content-type": "application/json" }, body: "{}" });
    const { url } = await bootstrap.json() as { url: string };
    const redirect = await fetch(url, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    const cookie = redirect.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const sessionResponse = await fetch(`${base}/v1/session`, { headers: { cookie: cookie! } });
    const { csrf } = await sessionResponse.json() as { csrf: string };
    assert.ok(csrf);
    assert.equal((await fetch(`${base}/v1/budget`, { method: "PATCH", headers: { cookie: cookie!, "content-type": "application/json" }, body: '{"dailyUsd":9}' })).status, 403);
    assert.equal((await fetch(`${base}/v1/budget`, { method: "PATCH", headers: { cookie: cookie!, origin: base, "x-omniroute-csrf": csrf, "content-type": "application/json" }, body: '{"dailyUsd":9}' })).status, 200);

    const route = await fetch(`${base}/v1/routes`, { method: "POST", headers: { authorization: "Bearer local-test-token", "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain it", sourceClient: "test", hostApplication: "test", hostModel: "claimed", hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: null, privacyMode: false, metadata: {} }) });
    assert.equal(route.status, 200);
    const result = await route.json() as { answer: string; badge: string; attribution: { hostModel: string | null } };
    assert.equal(result.answer, "daemon answer");
    assert.match(result.badge, /gpt-5\.6-sol/);
    assert.equal(result.attribution.hostModel, null);

    provider.responses.push({ text: JSON.stringify(planFixture()) }, { text: "streamed compatibility answer" });
    const compatible = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { authorization: "Bearer local-test-token", "content-type": "application/json" }, body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "stream this" }] }) });
    assert.equal(compatible.status, 200);
    assert.equal(compatible.headers.get("x-omniroute-worker"), "openai/gpt-5.6-luna");
    const compatibleBody = await compatible.text();
    assert.ok((compatibleBody.match(/chat\.completion\.chunk/g) ?? []).length >= 3);
    const streamedText = compatibleBody.split(/\r?\n/).filter((line) => line.startsWith("data: {")).map((line) => {
      const chunk = JSON.parse(line.slice(6)) as { choices?: Array<{ delta?: { content?: string } }> };
      return chunk.choices?.[0]?.delta?.content ?? "";
    }).join("");
    assert.match(streamedText, /streamed compatibility answer/);
    assert.match(compatibleBody, /gpt-5\.6-sol/);

    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/missing-dashboard-asset.js`)).status, 404);

    const second = new OmniDaemonServer(runtime);
    await assert.rejects(second.start(), (error: unknown) => error instanceof SafeError && error.code === "DAEMON_ALREADY_RUNNING");
  } finally { await daemon.stop(); await rm(root, { recursive: true, force: true }); }
});

test("daemon enforces the configured concurrent-route limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-daemon-concurrency-"));
  const port = await freePort();
  let releaseWorker!: () => void, workerStarted!: () => void;
  const release = new Promise<void>((resolve) => { releaseWorker = resolve; });
  const started = new Promise<void>((resolve) => { workerStarted = resolve; });
  class BlockingProvider extends MockProvider {
    override async *stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent> {
      yield { type: "start", responseId: "blocking-worker" };
      workerStarted();
      await release;
      yield { type: "delta", text: "done" };
      yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, estimatedCostUsd: null } };
      yield { type: "done", responseId: "blocking-worker" };
      void request;
    }
  }
  const config = configFixture(); config.daemon.port = port; config.daemon.allowedOrigins = [`http://127.0.0.1:${port}`]; config.daemon.maxConcurrentRoutes = 1; config.budgets.taskClassMaximum.small = 10;
  const paths = getRuntimePaths(root), provider = new BlockingProvider("openai");
  provider.responses.push({ text: JSON.stringify(planFixture()) });
  const audit = new AuditStore(paths.routes), logger = new JsonlLogger(paths.log);
  const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registryFixture([modelFixture(), lunaFixture()]), audit, logger });
  const daemon = new OmniDaemonServer({ config, paths, token: "concurrency-token", providers: new Map([[provider.id, provider]]), registry: { current: async () => registryFixture([modelFixture(), lunaFixture()]) }, audit, logger, router } as never);
  try {
    await daemon.start();
    const body = JSON.stringify({ prompt: "focused task", sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: null, privacyMode: false, metadata: {} });
    const options = { method: "POST", headers: { authorization: "Bearer concurrency-token", "content-type": "application/json" }, body };
    const first = fetch(`http://127.0.0.1:${port}/v1/routes`, options);
    await started;
    const second = await fetch(`http://127.0.0.1:${port}/v1/routes`, options);
    assert.equal(second.status, 429);
    releaseWorker();
    assert.equal((await first).status, 200);
  } finally { releaseWorker(); await daemon.stop(); await rm(root, { recursive: true, force: true }); }
});

test("daemon aborts provider work when a client disconnects after sending the request body", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-daemon-disconnect-"));
  const port = await freePort();
  let workerStarted!: () => void, providerCancelled!: (responseId: string) => void;
  const started = new Promise<void>((resolve) => { workerStarted = resolve; });
  const cancelled = new Promise<string>((resolve) => { providerCancelled = resolve; });
  class DisconnectProvider extends MockProvider {
    override async *stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent> {
      yield { type: "start", responseId: "disconnected-worker" };
      workerStarted();
      await new Promise<void>((_resolve, reject) => {
        const abort = (): void => reject(request.signal.reason ?? new DOMException("aborted", "AbortError"));
        if (request.signal.aborted) abort();
        else request.signal.addEventListener("abort", abort, { once: true });
      });
    }
    override async cancel(responseId: string): Promise<void> {
      await super.cancel(responseId);
      providerCancelled(responseId);
    }
  }
  const config = configFixture(); config.daemon.port = port; config.daemon.allowedOrigins = [`http://127.0.0.1:${port}`]; config.budgets.taskClassMaximum.small = 10;
  const paths = getRuntimePaths(root), provider = new DisconnectProvider("openai");
  provider.responses.push({ text: JSON.stringify(planFixture()) });
  const audit = new AuditStore(paths.routes), logger = new JsonlLogger(paths.log);
  const registrySnapshot = registryFixture([modelFixture(), lunaFixture()]);
  const router = new OmniRouter({ config, providers: new Map([[provider.id, provider]]), registry: async () => registrySnapshot, audit, logger });
  const daemon = new OmniDaemonServer({ config, paths, token: "disconnect-token", providers: new Map([[provider.id, provider]]), registry: { current: async () => registrySnapshot }, audit, logger, router } as never);
  try {
    await daemon.start();
    const body = JSON.stringify({ prompt: "focused task", sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: null, privacyMode: false, metadata: {} });
    const client = httpRequest({ host: "127.0.0.1", port, path: "/v1/routes", method: "POST", headers: { authorization: "Bearer disconnect-token", "content-type": "application/json", "content-length": Buffer.byteLength(body) } });
    client.on("error", () => undefined);
    client.end(body);
    await started;
    client.destroy();
    const cancelledResponseId = await Promise.race([
      cancelled,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("provider cancellation timed out")), 2_000)),
    ]);
    assert.equal(cancelledResponseId, "disconnected-worker");
    assert.deepEqual(provider.cancelled, ["disconnected-worker"]);
  } finally { await daemon.stop(); await rm(root, { recursive: true, force: true }); }
});
