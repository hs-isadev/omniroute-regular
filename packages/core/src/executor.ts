import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { globalRedactor } from "@omniroute/observability";

export type ExecutorSideEffect = "none" | "workspace-write" | "external";
export interface ExecutorDeclaration {
  id: string;
  enabled: boolean;
  command: string;
  /** Fixed argv owned by the integration; callers cannot append flags or prompts. */
  commandArgs: string[];
  workspaceRoots: string[];
  environmentAllowlist: string[];
  timeoutMs: number;
  maxConcurrent: number;
  sideEffect: ExecutorSideEffect;
  supportsCancellation: boolean;
  maxOutputBytes: number;
  route?: { providerId: string; modelId: string };
}

export interface CommandRunInput {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  signal: AbortSignal;
  maxOutputBytes: number;
}
export interface CommandRunOutput { exitCode: number | null; stdout: string; stderr: string }
export interface CommandRunner { run(input: CommandRunInput): Promise<CommandRunOutput> }
export interface ExecutorRequest {
  executorId: string;
  workspace: string;
  environment?: Record<string, string>;
  approvalId?: string;
  signal?: AbortSignal;
}
export interface ExecutorResult {
  status: "completed" | "failed" | "cancelled" | "timed_out";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  elapsedMs: number;
  changedPaths: string[];
  diff: null;
  testResults: [];
  usage: null;
  route: { providerId: string; modelId: string } | null;
  error: string | null;
}

function error(code: string): never { throw new Error(code); }

function bounded(text: string, maximum: number): { text: string; truncated: boolean } {
  const redacted = globalRedactor.redactText(text);
  if (Buffer.byteLength(redacted, "utf8") <= maximum) return { text: redacted, truncated: false };
  const suffix = "\n[TRUNCATED]";
  return { text: `${Buffer.from(redacted, "utf8").subarray(0, Math.max(0, maximum - Buffer.byteLength(suffix, "utf8"))).toString("utf8")}${suffix}`, truncated: true };
}

function workspaceAllowed(workspace: string, roots: string[]): string | null {
  const requested = resolve(workspace);
  for (const root of roots.map((item) => resolve(item))) if (requested === root || requested.startsWith(`${root}${sep}`)) return requested;
  return null;
}

class LocalCommandRunner implements CommandRunner {
  async run(input: CommandRunInput): Promise<CommandRunOutput> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(input.command, input.args, { cwd: input.cwd, env: input.env, shell: false, windowsHide: true });
      let stdout = "", stderr = "";
      const stop = (): void => { child.kill(); };
      if (input.signal.aborted) stop();
      else input.signal.addEventListener("abort", stop, { once: true });
      child.stdout.on("data", (chunk: Buffer) => { if (Buffer.byteLength(stdout, "utf8") <= input.maxOutputBytes) stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { if (Buffer.byteLength(stderr, "utf8") <= input.maxOutputBytes) stderr += chunk.toString("utf8"); });
      child.once("error", reject);
      child.once("close", (exitCode) => resolvePromise({ exitCode, stdout, stderr }));
    });
  }
}

export class ControlledExecutor {
  readonly #declarations: Map<string, ExecutorDeclaration>;
  readonly #running = new Map<string, number>();
  readonly #runner: CommandRunner;

  constructor(declarations: ExecutorDeclaration[], runner: CommandRunner = new LocalCommandRunner()) {
    this.#declarations = new Map(declarations.map((item) => [item.id, item]));
    if (this.#declarations.size !== declarations.length) error("EXECUTOR_DUPLICATE_ID");
    this.#runner = runner;
  }

  async execute(input: ExecutorRequest): Promise<ExecutorResult> {
    const declaration = this.#declarations.get(input.executorId);
    if (!declaration) error("EXECUTOR_NOT_FOUND");
    if (!declaration.enabled) error("EXECUTOR_DISABLED");
    if (!declaration.command || declaration.command.includes("\0") || declaration.commandArgs.some((item) => typeof item !== "string" || item.includes("\0"))) error("EXECUTOR_DECLARATION_INVALID");
    if (declaration.sideEffect !== "none" && !input.approvalId?.trim()) error("EXECUTOR_APPROVAL_REQUIRED");
    const workspace = workspaceAllowed(input.workspace, declaration.workspaceRoots);
    if (!workspace) error("EXECUTOR_WORKSPACE_DENIED");
    const environment = input.environment ?? {};
    for (const [key, value] of Object.entries(environment)) if (!declaration.environmentAllowlist.includes(key) || typeof value !== "string" || key.includes("=")) error("EXECUTOR_ENV_DENIED");
    const active = this.#running.get(declaration.id) ?? 0;
    if (!Number.isInteger(declaration.maxConcurrent) || declaration.maxConcurrent < 1 || active >= declaration.maxConcurrent) error("EXECUTOR_CONCURRENCY_EXCEEDED");
    this.#running.set(declaration.id, active + 1);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(new DOMException("executor timed out", "TimeoutError")); }, declaration.timeoutMs);
    const forwardAbort = (): void => controller.abort(input.signal?.reason ?? new DOMException("executor cancelled", "AbortError"));
    if (input.signal?.aborted) forwardAbort();
    else input.signal?.addEventListener("abort", forwardAbort, { once: true });
    const started = Date.now();
    try {
      const output = await this.#runner.run({ command: declaration.command, args: [...declaration.commandArgs], cwd: workspace, env: { ...environment }, signal: controller.signal, maxOutputBytes: declaration.maxOutputBytes });
      const stdout = bounded(output.stdout, declaration.maxOutputBytes), stderr = bounded(output.stderr, declaration.maxOutputBytes);
      return { status: output.exitCode === 0 ? "completed" : "failed", exitCode: output.exitCode, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated, elapsedMs: Date.now() - started, changedPaths: [], diff: null, testResults: [], usage: null, route: declaration.route ?? null, error: null };
    } catch (cause) {
      const detail = bounded(cause instanceof Error ? cause.message : String(cause), declaration.maxOutputBytes);
      return { status: timedOut ? "timed_out" : controller.signal.aborted ? "cancelled" : "failed", exitCode: null, stdout: "", stderr: "", truncated: detail.truncated, elapsedMs: Date.now() - started, changedPaths: [], diff: null, testResults: [], usage: null, route: declaration.route ?? null, error: detail.text };
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", forwardAbort);
      this.#running.set(declaration.id, active);
    }
  }
}
