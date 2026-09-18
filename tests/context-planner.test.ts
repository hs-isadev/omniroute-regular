import assert from "node:assert/strict";
import test from "node:test";
import { compactWorkerPacket, selectMinimalContext } from "@omniroute/core";

test("minimal context selects a requested symbol and removes duplicate source bodies", () => {
  const result = selectMinimalContext({
    references: [{ path: "src/math.ts", symbol: "target" }, { path: "src/copy.ts" }],
    files: [
      { path: "src/math.ts", text: "export const noise = 1;\nexport function target() { return 2; }\nexport const tail = 3;" },
      { path: "src/copy.ts", text: "export const noise = 1;\nexport function target() { return 2; }\nexport const tail = 3;" },
    ],
    maxTokens: 40,
  });
  assert.equal(result.excerpts.length, 1);
  assert.equal(result.excerpts[0]?.path, "src/math.ts#target");
  assert.match(result.excerpts[0]?.text ?? "", /function target/);
  assert.deepEqual(result.omitted, [{ path: "src/copy.ts", reason: "DUPLICATE_CONTENT" }]);
});

test("compaction preserves structured history while bounding command and diff bodies deterministically", () => {
  const compacted = compactWorkerPacket({
    objective: "Inspect output",
    excerpts: [{ path: "src/a.ts", text: "x".repeat(400) }],
    constraints: ["No edits"],
    acceptanceCriteria: ["Return findings"],
    requestedOutput: "Short report",
    independent: true,
    worthwhile: true,
    responseTokens: 100,
    instructionReserveTokens: 256,
    synthesisReserveTokens: 256,
    contextHistory: [
      { kind: "command", name: "npm test", status: "failed", text: "A".repeat(200) },
      { kind: "diff", name: "git diff", status: "completed", text: "B".repeat(200) },
    ],
  }, { maxTokens: 160, maxItemTokens: 30 });
  assert.ok(compacted.inputTokens <= 160);
  assert.equal(compacted.packet.contextHistory?.length, 2);
  assert.match(compacted.packet.contextHistory?.[0]?.text ?? "", /TRUNCATED/);
  assert.match(compacted.packet.contextHistory?.[1]?.text ?? "", /TRUNCATED/);
  assert.equal(compacted.packet.contextHistory?.[0]?.kind, "command");
});
