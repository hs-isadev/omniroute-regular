import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { atomicWriteFile } from "@omniroute/config";
import {
  CAPABILITIES,
  TASK_STATE_TRANSITIONS,
  TASK_STATES,
  newRouteId,
  type TaskEnvelope,
  type TaskVerification,
  type TaskState,
  type TaskSubmission,
  type TaskTransitionInput,
} from "@omniroute/contracts";
import { globalRedactor } from "@omniroute/observability";

const TERMINAL_STATES = new Set<TaskState>(["completed", "failed", "cancelled"]);
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;

function fail(code: string): never { throw new Error(code); }

function ensureTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) fail("TASK_TIMESTAMP_INVALID");
  return value;
}

function uniqueStrings(values: string[], code: string): string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) fail(code);
  return [...new Set(values.map((value) => value.trim()))];
}

function validateSubmission(input: TaskSubmission): TaskSubmission {
  if (!input || typeof input.objective !== "string" || !input.objective.trim() || input.objective.length > 20_000) fail("TASK_SUBMISSION_INVALID");
  if (input.parentId !== undefined && input.parentId !== null && (!TASK_ID.test(input.parentId) || input.parentId.length > 128)) fail("TASK_PARENT_ID_INVALID");
  if (input.idempotencyKey !== null && (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim() || input.idempotencyKey.length > 256)) fail("TASK_IDEMPOTENCY_KEY_INVALID");
  const budget = input.budget;
  if (!budget || !Number.isInteger(budget.maxAttempts) || budget.maxAttempts < 1 || budget.maxAttempts > 8 || !Number.isInteger(budget.maxOutputTokens) || budget.maxOutputTokens < 1 || !Number.isInteger(budget.maxLatencyMs) || budget.maxLatencyMs < 1 || (budget.maxCostUsd !== null && (!Number.isFinite(budget.maxCostUsd) || budget.maxCostUsd < 0))) fail("TASK_BUDGET_INVALID");
  if (!Array.isArray(input.contextReferences) || input.contextReferences.some((item) => !item || typeof item.path !== "string" || !item.path.trim() || item.path.length > 1_000 || (item.symbol !== undefined && typeof item.symbol !== "string") || (item.digest !== undefined && typeof item.digest !== "string"))) fail("TASK_CONTEXT_INVALID");
  if (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.some((item) => !CAPABILITIES.includes(item))) fail("TASK_CAPABILITIES_INVALID");
  return {
    ...input,
    parentId: input.parentId ?? null,
    objective: input.objective.trim(),
    constraints: uniqueStrings(input.constraints, "TASK_CONSTRAINTS_INVALID"),
    contextReferences: input.contextReferences.map((item) => ({ path: item.path.trim(), ...(item.symbol?.trim() ? { symbol: item.symbol.trim() } : {}), ...(item.digest?.trim() ? { digest: item.digest.trim() } : {}) })),
    requiredCapabilities: [...new Set(input.requiredCapabilities)],
    approvedTools: uniqueStrings(input.approvedTools, "TASK_TOOLS_INVALID"),
    stopConditions: uniqueStrings(input.stopConditions, "TASK_STOP_CONDITIONS_INVALID"),
    acceptanceCriteria: uniqueStrings(input.acceptanceCriteria, "TASK_ACCEPTANCE_INVALID"),
    idempotencyKey: input.idempotencyKey?.trim() || null,
  };
}

function assertTaskId(id: string): void {
  if (typeof id !== "string" || !TASK_ID.test(id)) fail("TASK_ID_INVALID");
}

function assertEnvelope(value: TaskEnvelope): TaskEnvelope {
  if (!value || value.schemaVersion !== 1 || !TASK_ID.test(value.id) || !TASK_STATES.includes(value.state) || !Number.isInteger(value.attempt) || value.attempt < 0) fail("TASK_ENVELOPE_CORRUPT");
  validateSubmission(value);
  ensureTimestamp(value.createdAt);
  ensureTimestamp(value.updatedAt);
  if (!Array.isArray(value.events) || !Array.isArray(value.artifacts) || !Array.isArray(value.verification)) fail("TASK_ENVELOPE_CORRUPT");
  return value;
}

function idForKey(key: string): string {
  return `task-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

export function isTerminalTaskState(state: TaskState): boolean {
  return TERMINAL_STATES.has(state);
}

export function createTaskEnvelope(input: TaskSubmission, at = new Date().toISOString(), id = `task-${newRouteId()}`): TaskEnvelope {
  const submission = validateSubmission(input);
  assertTaskId(id);
  const timestamp = ensureTimestamp(at);
  return {
    schemaVersion: 1,
    ...submission,
    id,
    state: "queued",
    attempt: 0,
    selectedRoute: null,
    events: [{ type: "submitted", at: timestamp, from: null, to: "queued", reason: null }],
    artifacts: [],
    verification: [],
    redactedError: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function transitionTaskEnvelope(task: TaskEnvelope, to: TaskState, input: TaskTransitionInput = {}): TaskEnvelope {
  const current = assertEnvelope(task);
  if (!TASK_STATES.includes(to) || !TASK_STATE_TRANSITIONS[current.state].includes(to)) fail("TASK_TRANSITION_INVALID");
  const at = ensureTimestamp(input.at ?? new Date().toISOString());
  const attempt = current.attempt + (to === "executing" ? 1 : 0);
  if (attempt > current.budget.maxAttempts) fail("TASK_ATTEMPTS_EXHAUSTED");
  return {
    ...current,
    state: to,
    attempt,
    selectedRoute: input.route ?? current.selectedRoute,
    artifacts: [...current.artifacts, ...(input.artifacts ?? [])],
    verification: [...current.verification, ...(input.verification ?? [])],
    redactedError: input.error === undefined ? current.redactedError : globalRedactor.redactText(input.error),
    events: [...current.events, { type: "state.changed", at, from: current.state, to, reason: input.reason?.trim() || null }],
    updatedAt: at,
  };
}

export class PersistentTaskStore {
  readonly #tasksDir: string;
  readonly #submitLocks = new Map<string, Promise<TaskEnvelope>>();

  constructor(root: string) {
    this.#tasksDir = resolve(root, "tasks");
  }

  async submit(input: TaskSubmission, at = new Date().toISOString()): Promise<TaskEnvelope> {
    const submission = validateSubmission(input);
    const id = submission.idempotencyKey ? idForKey(submission.idempotencyKey) : `task-${newRouteId()}`;
    const existingWork = this.#submitLocks.get(id);
    if (existingWork) return existingWork;
    const work = this.submitOnce(submission, ensureTimestamp(at), id);
    this.#submitLocks.set(id, work);
    try { return await work; } finally { this.#submitLocks.delete(id); }
  }

  async get(id: string): Promise<TaskEnvelope | null> {
    assertTaskId(id);
    try { return assertEnvelope(JSON.parse(await readFile(this.pathFor(id), "utf8")) as TaskEnvelope); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async transition(id: string, to: TaskState, input: TaskTransitionInput = {}): Promise<TaskEnvelope> {
    const task = await this.get(id);
    if (!task) fail("TASK_NOT_FOUND");
    const next = transitionTaskEnvelope(task, to, input);
    await this.write(next);
    return next;
  }

  async recordVerification(id: string, verification: TaskVerification): Promise<TaskEnvelope> {
    const task = await this.get(id);
    if (!task) fail("TASK_NOT_FOUND");
    if (!verification || typeof verification.check !== "string" || !verification.check.trim() || !["passed", "failed", "skipped"].includes(verification.status) || typeof verification.summary !== "string") fail("TASK_VERIFICATION_INVALID");
    const next: TaskEnvelope = {
      ...task,
      verification: [...task.verification, { ...verification, check: verification.check.trim(), summary: globalRedactor.redactText(verification.summary), at: ensureTimestamp(verification.at) }],
      updatedAt: ensureTimestamp(verification.at),
    };
    await this.write(next);
    return next;
  }

  async recover(): Promise<TaskEnvelope[]> {
    let names: string[];
    try { names = await readdir(this.#tasksDir); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const tasks = await Promise.all(names.filter((name) => name.endsWith(".json")).sort().map(async (name) => {
      const id = name.slice(0, -5);
      assertTaskId(id);
      return this.get(id);
    }));
    return tasks.filter((task): task is TaskEnvelope => task !== null && !isTerminalTaskState(task.state)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  private async submitOnce(input: TaskSubmission, at: string, id: string): Promise<TaskEnvelope> {
    const existing = await this.get(id);
    if (existing) {
      if (existing.idempotencyKey !== input.idempotencyKey) fail("TASK_IDEMPOTENCY_CONFLICT");
      return existing;
    }
    const task = createTaskEnvelope(input, at, id);
    await this.write(task);
    return task;
  }

  private pathFor(id: string): string {
    assertTaskId(id);
    const path = resolve(this.#tasksDir, `${id}.json`);
    if (!path.startsWith(`${this.#tasksDir}${sep}`)) fail("TASK_ID_INVALID");
    return path;
  }

  private async write(task: TaskEnvelope): Promise<void> {
    assertEnvelope(task);
    await atomicWriteFile(this.pathFor(task.id), `${JSON.stringify(task, null, 2)}\n`);
  }
}
