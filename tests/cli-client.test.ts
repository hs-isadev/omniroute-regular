import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getRuntimePaths, saveConfig } from "@omniroute/config";
import { InMemoryKeyProtector } from "@omniroute/vault";
import { DaemonClient } from "../apps/cli/src/client.js";
import { freeConfigFixture } from "./helpers.js";

test("CLI surfaces native stream failures instead of hiding them as incomplete output", async () => {
  const root = await mkdtemp(join(tmpdir(), "omni-cli-errors-"));
  const originalFetch = globalThis.fetch;
  try {
    const paths = getRuntimePaths(root);
    await saveConfig(freeConfigFixture(), paths);
    const client = new DaemonClient(paths, new InMemoryKeyProtector());
    const request = { prompt: "test", sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: 100, privacyMode: null, metadata: {} };
    for (const payload of [
      'event: error\ndata: {"code":"PROVIDER_HTTP_ERROR","message":"Groq token limit","status":502}\n\n',
      'event: route.failed\ndata: {"error":"Groq token limit"}\n\nevent: error\ndata: {"code":"PROVIDER_HTTP_ERROR","status":502}\n\n',
    ]) {
      globalThis.fetch = async () => new Response(payload);
      await assert.rejects(client.streamRoute(request, () => {}), /Groq token limit/);
    }
    globalThis.fetch = async () => new Response('event: worker.started\ndata: {}\n\n');
    await assert.rejects(client.streamRoute(request, () => {}), /without a final result/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
