import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DurableSessionStore, compactSessionMessages, estimateSessionTokens } from "@omniroute/core";

test("session compaction keeps recent turns and stays under the configured budget", () => {
  const result = compactSessionMessages([
    { role: "system", content: "You are a coding assistant." },
    { role: "user", content: "old user context ".repeat(30) },
    { role: "assistant", content: "old assistant context ".repeat(30) },
    { role: "user", content: "recent question" },
    { role: "assistant", content: "recent answer" },
  ], { maxTokens: 45, recentMessages: 2 });
  assert.ok(result.messages.some((message) => message.role === "system"));
  assert.ok(result.messages.some((message) => message.content.includes("Compacted history")));
  assert.equal(result.messages.at(-1)?.content, "recent answer");
  assert.ok(estimateSessionTokens(result.messages) <= 45);
});

test("compaction still bounds an oversized system prompt", () => {
  const result = compactSessionMessages([{ role: "system", content: "policy ".repeat(2_000) }], { maxTokens: 45, recentMessages: 1 });
  assert.ok(estimateSessionTokens(result.messages) <= 45);
});

test("durable sessions persist, compact, list and reset without exposing invalid paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-session-"));
  try {
    const store = new DurableSessionStore(join(root, "sessions"), { maxTokens: 80, recentMessages: 4 });
    await store.save("opencode-main", [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "third" },
    ]);
    const loaded = await store.load("opencode-main");
    assert.equal(loaded?.id, "opencode-main");
    assert.equal(loaded?.messages.length, 3);
    assert.deepEqual(await store.list(), ["opencode-main"]);
    await store.reset("opencode-main");
    await assert.rejects(access(join(root, "sessions", "opencode-main.json")), /ENOENT/);
    await assert.rejects(store.load("../escape"), /SESSION_ID_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
