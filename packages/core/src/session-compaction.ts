import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { atomicWriteFile } from "@omniroute/config";

export type SessionMessageRole = "system" | "user" | "assistant" | "tool";

export interface SessionMessage {
  role: SessionMessageRole;
  content: string;
  at?: string;
}

export interface SessionCompactionOptions {
  maxTokens: number;
  recentMessages: number;
  retentionDays?: number;
}

export interface SessionCompactionResult {
  messages: SessionMessage[];
  inputTokens: number;
  compacted: boolean;
  omittedMessages: number;
  digest: string;
}

export interface DurableSessionSnapshot {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: SessionMessage[];
  compaction: { inputTokens: number; omittedMessages: number; digest: string };
}

function validRole(value: unknown): value is SessionMessageRole {
  return value === "system" || value === "user" || value === "assistant" || value === "tool";
}

function normalizeMessage(value: unknown): SessionMessage {
  if (!value || typeof value !== "object") throw new Error("SESSION_MESSAGE_INVALID");
  const input = value as { role?: unknown; content?: unknown; at?: unknown };
  if (!validRole(input.role) || typeof input.content !== "string") throw new Error("SESSION_MESSAGE_INVALID");
  return { role: input.role, content: input.content, ...(typeof input.at === "string" ? { at: input.at } : {}) };
}

/** Conservative estimate used before a provider-specific tokenizer is known. */
export function estimateSessionTokens(messages: SessionMessage[]): number {
  return messages.reduce((total, message) => total + Math.ceil((message.role.length + message.content.length + 4) / 4), 0);
}

function truncate(text: string, tokens: number): string {
  const limit = Math.max(1, Math.floor(tokens * 4));
  if (text.length <= limit) return text;
  if (limit <= 32) return text.slice(0, limit);
  return `${text.slice(0, limit - 32)}\n…[COMPACTED]…`;
}

function digest(messages: SessionMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

export function compactSessionMessages(input: SessionMessage[], options: SessionCompactionOptions): SessionCompactionResult {
  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 1 || !Number.isInteger(options.recentMessages) || options.recentMessages < 1) throw new Error("SESSION_COMPACTION_OPTIONS_INVALID");
  const messages = input.map(normalizeMessage);
  if (estimateSessionTokens(messages) <= options.maxTokens) return { messages, inputTokens: estimateSessionTokens(messages), compacted: false, omittedMessages: 0, digest: digest(messages) };

  const systems = messages.filter((message) => message.role === "system").slice(0, 1);
  const nonSystems = messages.filter((message) => message.role !== "system");
  const recent = nonSystems.slice(-options.recentMessages);
  const older = nonSystems.slice(0, Math.max(0, nonSystems.length - recent.length));
  const summary = older.length > 0 ? { role: "system" as const, content: `[Compacted history: ${older.length} messages]\n${older.map((message) => `${message.role}: ${message.content}`).join("\n")}` } : null;
  const compacted: SessionMessage[] = [...systems, ...(summary ? [summary] : []), ...recent];

  // Reduce the largest non-system body first. This is deterministic and never
  // asks another model to summarize private session content.
  while (estimateSessionTokens(compacted) > options.maxTokens) {
    let candidates = compacted
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role !== "system" || message.content.startsWith("[Compacted history:"))
      .sort((left, right) => right.message.content.length - left.message.content.length || left.index - right.index);
    // A very large system prompt is unusual, but it must not make the budget
    // guarantee impossible. Once user/assistant/tool content is minimized,
    // allow the system prompt to be reduced as a final deterministic fallback.
    if (candidates.length === 0) {
      candidates = compacted
        .map((message, index) => ({ message, index }))
        .sort((left, right) => right.message.content.length - left.message.content.length || left.index - right.index);
    }
    const candidate = candidates[0];
    if (!candidate) break;
    const currentTokens = Math.max(1, Math.ceil(candidate.message.content.length / 4));
    const nextTokens = Math.max(1, Math.floor(currentTokens / 2));
    if (candidate.message.content.length <= 4 || nextTokens >= currentTokens) {
      compacted.splice(candidate.index, 1);
      continue;
    }
    candidate.message.content = truncate(candidate.message.content, nextTokens);
    if (candidate.message.content.length <= 1) compacted.splice(candidate.index, 1);
  }
  const bounded = compacted.length ? compacted : [{ role: "system" as const, content: "[Compacted history omitted to fit the configured context budget]" }];
  return { messages: bounded, inputTokens: estimateSessionTokens(bounded), compacted: true, omittedMessages: Math.max(0, messages.length - bounded.length), digest: digest(bounded) };
}

function validateSessionId(id: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id === "." || id === "..") throw new Error("SESSION_ID_INVALID");
}

export class DurableSessionStore {
  readonly #directory: string;
  readonly #options: SessionCompactionOptions;
  readonly #writes = new Map<string, Promise<void>>();

  constructor(directory: string, options: SessionCompactionOptions) {
    this.#directory = directory;
    this.#options = options;
  }

  private path(id: string): string {
    validateSessionId(id);
    return join(this.#directory, `${id}.json`);
  }

  private async withWriteLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#writes.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.#writes.set(id, current);
    await previous.catch(() => undefined);
    try { return await operation(); } finally {
      release();
      if (this.#writes.get(id) === current) this.#writes.delete(id);
    }
  }

  async load(id: string): Promise<DurableSessionSnapshot | null> {
    const path = this.path(id);
    let raw: string;
    try { raw = await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("SESSION_FILE_INVALID"); }
    if (!parsed || typeof parsed !== "object") throw new Error("SESSION_FILE_INVALID");
    const value = parsed as Partial<DurableSessionSnapshot>;
    if (value.schemaVersion !== 1 || value.id !== id || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !Array.isArray(value.messages)) throw new Error("SESSION_FILE_INVALID");
    const messages = value.messages.map(normalizeMessage);
    if (this.#options.retentionDays !== undefined && Date.parse(value.updatedAt) < Date.now() - this.#options.retentionDays * 86_400_000) {
      await unlink(path).catch(() => undefined);
      return null;
    }
    const compacted = compactSessionMessages(messages, this.#options);
    return {
      schemaVersion: 1,
      id,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      messages: compacted.messages,
      compaction: { inputTokens: compacted.inputTokens, omittedMessages: compacted.omittedMessages, digest: compacted.digest },
    };
  }

  async save(id: string, messages: SessionMessage[]): Promise<DurableSessionSnapshot> {
    return this.withWriteLock(id, async () => {
      const path = this.path(id);
      await mkdir(this.#directory, { recursive: true, mode: 0o700 });
      const now = new Date().toISOString();
      const existing = await this.load(id);
      const compacted = compactSessionMessages(messages, this.#options);
      const snapshot: DurableSessionSnapshot = {
        schemaVersion: 1,
        id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        messages: compacted.messages,
        compaction: { inputTokens: compacted.inputTokens, omittedMessages: compacted.omittedMessages, digest: compacted.digest },
      };
      await atomicWriteFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
      return snapshot;
    });
  }

  async list(): Promise<string[]> {
    let entries: string[];
    try { entries = await readdir(this.#directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const ids = entries.filter((entry) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(entry)).map((entry) => basename(entry, ".json"));
    const active: string[] = [];
    for (const id of ids) if (await this.load(id)) active.push(id);
    return active.sort();
  }

  async reset(id: string): Promise<void> {
    await this.withWriteLock(id, async () => {
      try { await unlink(this.path(id)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    });
  }
}
