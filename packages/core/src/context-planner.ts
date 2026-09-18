import { createHash } from "node:crypto";
import type { ContextHistoryItem, TaskContextReference, WorkerTaskPacket } from "@omniroute/contracts";

export interface ContextFile { path: string; text: string }
export interface MinimalContextInput {
  references: TaskContextReference[];
  files: ContextFile[];
  maxTokens: number;
}
export interface MinimalContextResult {
  excerpts: Array<{ path: string; text: string }>;
  omitted: Array<{ path: string; reason: "DUPLICATE_CONTENT" | "NOT_FOUND" | "BUDGET_EXCEEDED" }>;
  inputTokens: number;
}
export interface ContextCompactionPolicy { maxTokens: number; maxItemTokens: number }
export interface CompactedWorkerPacket { packet: WorkerTaskPacket; inputTokens: number; omittedExcerpts: number }

function estimate(text: string): number {
  let cost = 0;
  for (const character of text) cost += character.charCodeAt(0) <= 127 ? 0.25 : 0.5;
  return Math.ceil(cost);
}

function truncate(text: string, maximumTokens: number): string {
  const maximum = Math.max(1, maximumTokens) * 4;
  if (text.length <= maximum) return text;
  const head = Math.max(1, Math.floor((maximum - 27) * 0.65));
  const tail = Math.max(1, maximum - 27 - head);
  return `${text.slice(0, head)}\n…[TRUNCATED]…\n${text.slice(-tail)}`;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function symbolExcerpt(text: string, symbol: string | undefined): string {
  if (!symbol) return text;
  const match = new RegExp(`(?:export\\s+)?(?:async\\s+)?(?:function|class|const|let|var|interface|type)\\s+${escapePattern(symbol)}\\b`, "m").exec(text);
  if (!match) return text;
  const start = Math.max(0, match.index - 240);
  const end = Math.min(text.length, match.index + 1_600);
  return text.slice(start, end);
}

function packetTokens(packet: WorkerTaskPacket): number {
  return estimate(packet.objective) + estimate(packet.requestedOutput)
    + packet.constraints.reduce((total, value) => total + estimate(value), 0)
    + packet.acceptanceCriteria.reduce((total, value) => total + estimate(value), 0)
    + packet.excerpts.reduce((total, item) => total + estimate(item.path) + estimate(item.text), 0)
    + (packet.contextHistory ?? []).reduce((total, item) => total + estimate(item.kind) + estimate(item.name) + estimate(item.status) + estimate(item.text), 0);
}

function boundedHistory(items: ContextHistoryItem[] | undefined, maximum: number): ContextHistoryItem[] {
  if (!items) return [];
  return items.map((item) => {
    if (!item || !["tool", "command", "diff"].includes(item.kind) || !["completed", "failed", "cancelled", "skipped"].includes(item.status) || typeof item.name !== "string" || typeof item.text !== "string") throw new Error("INVALID_CONTEXT_HISTORY");
    return { kind: item.kind, name: item.name.trim(), status: item.status, text: truncate(item.text, maximum) };
  });
}

export function selectMinimalContext(input: MinimalContextInput): MinimalContextResult {
  if (!Number.isInteger(input.maxTokens) || input.maxTokens < 1) throw new Error("CONTEXT_BUDGET_INVALID");
  const files = new Map(input.files.map((file) => [file.path, file]));
  const excerpts: Array<{ path: string; text: string }> = [];
  const omitted: MinimalContextResult["omitted"] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const reference of input.references) {
    const file = files.get(reference.path);
    if (!file) { omitted.push({ path: reference.path, reason: "NOT_FOUND" }); continue; }
    const body = symbolExcerpt(file.text, reference.symbol);
    const digest = createHash("sha256").update(body).digest("hex");
    if (seen.has(digest)) { omitted.push({ path: reference.path, reason: "DUPLICATE_CONTENT" }); continue; }
    const path = reference.symbol ? `${reference.path}#${reference.symbol}` : reference.path;
    const allowance = input.maxTokens - used - estimate(path);
    if (allowance < 1) { omitted.push({ path: reference.path, reason: "BUDGET_EXCEEDED" }); continue; }
    const text = truncate(body, allowance);
    const cost = estimate(path) + estimate(text);
    if (used + cost > input.maxTokens) { omitted.push({ path: reference.path, reason: "BUDGET_EXCEEDED" }); continue; }
    seen.add(digest);
    excerpts.push({ path, text });
    used += cost;
  }
  return { excerpts, omitted, inputTokens: used };
}

export function compactWorkerPacket(packet: WorkerTaskPacket, policy: ContextCompactionPolicy): CompactedWorkerPacket {
  if (!Number.isInteger(policy.maxTokens) || policy.maxTokens < 1 || !Number.isInteger(policy.maxItemTokens) || policy.maxItemTokens < 1) throw new Error("CONTEXT_BUDGET_INVALID");
  const seen = new Set<string>();
  const excerpts = packet.excerpts.flatMap((item) => {
    const digest = createHash("sha256").update(item.text).digest("hex");
    if (seen.has(digest)) return [];
    seen.add(digest);
    return [{ path: item.path, text: truncate(item.text, policy.maxItemTokens) }];
  });
  const compacted: WorkerTaskPacket = { ...packet, excerpts, contextHistory: boundedHistory(packet.contextHistory, policy.maxItemTokens) };
  while (packetTokens(compacted) > policy.maxTokens) {
    const candidates = [
      ...compacted.excerpts.map((item, index) => ({ group: "excerpt" as const, index, size: item.text.length })),
      ...(compacted.contextHistory ?? []).map((item, index) => ({ group: "history" as const, index, size: item.text.length })),
    ].sort((a, b) => b.size - a.size || a.group.localeCompare(b.group) || a.index - b.index);
    const candidate = candidates[0];
    if (!candidate || candidate.size <= 32) break;
    const collection = candidate.group === "excerpt" ? compacted.excerpts : compacted.contextHistory!;
    const item = collection[candidate.index]!;
    item.text = truncate(item.text, Math.max(1, Math.floor(estimate(item.text) / 2)));
  }
  return { packet: compacted, inputTokens: packetTokens(compacted), omittedExcerpts: packet.excerpts.length - excerpts.length };
}
