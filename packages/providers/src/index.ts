import { spawn } from "node:child_process";
import { lookup as dnsLookup } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import type {
  ModelCapabilities,
  ModelEntry,
  ProviderErrorShape,
  ReasoningEffort,
  RegistrySnapshot,
  Usage,
} from "@omniroute/contracts";
import { newRouteId, ORCHESTRATOR_MODEL_ID, REASONING_EFFORTS } from "@omniroute/contracts";
import type { OmniConfig, ProviderSettings } from "@omniroute/config";
import { EXTRA_FREE_PROVIDERS, isSafeProviderBaseUrl } from "@omniroute/config";
import { globalRedactor, SafeError } from "@omniroute/observability";

export interface ProviderModel {
  id: string;
  name: string;
  createdAt: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  capabilities: Partial<ModelCapabilities>;
  reasoningEfforts: ReasoningEffort[];
}

export interface ProviderHealth {
  status: "healthy" | "unhealthy" | "unknown";
  checkedAt: string;
  latencyMs: number | null;
  message: string | null;
}

export interface GenerateRequest {
  modelId: string;
  prompt: string;
  instructions: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  jsonSchema: Record<string, unknown> | null;
  schemaName: string | null;
  signal: AbortSignal;
  safetyIdentifier: string | null;
}

export interface GenerateResult {
  text: string;
  usage: Usage;
  responseId: string | null;
}

export type ProviderStreamEvent =
  | { type: "start"; responseId: string | null }
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done"; responseId: string | null };

export interface ProviderAdapter {
  readonly id: string;
  readonly supportsStreaming: boolean;
  listModels(signal?: AbortSignal): Promise<ProviderModel[]>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent>;
  cancel(responseId: string): Promise<void>;
  classifyError(error: unknown): ProviderErrorShape;
}

export type FetchLike = typeof fetch;

function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, estimatedCostUsd: null, measurement: "unavailable" };
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export class ProviderHttpError extends SafeError {
  readonly rateLimitCode: boolean;
  constructor(
    readonly providerId: string,
    readonly providerStatus: number,
    readonly retryAfterMs: number | null,
    message: string,
  ) {
    super("PROVIDER_HTTP_ERROR", `${providerId} request failed with HTTP ${providerStatus}: ${message}`, 502);
    let code: unknown;
    try { code = (JSON.parse(message) as { error?: { code?: unknown } }).error?.code; } catch { /* Non-JSON HTTP errors retain status-based classification. */ }
    this.rateLimitCode = code === "rate_limit_exceeded";
  }
}

function classifyProviderError(providerId: string, error: unknown): ProviderErrorShape {
  if (error instanceof DOMException && error.name === "AbortError") return { category: "cancelled", message: `${providerId} request was cancelled`, retryable: false, retryAfterMs: null, providerStatus: null };
  if (error instanceof SafeError && error.code === "PROVIDER_STREAM_TRUNCATED") return { category: "transient", message: error.message, retryable: true, retryAfterMs: null, providerStatus: null };
  if (error instanceof ProviderHttpError) {
    const status = error.providerStatus;
    if (status === 401 || status === 403) return { category: "authentication", message: error.message, retryable: false, retryAfterMs: null, providerStatus: status };
    if (status === 429 || status === 402 || (status === 413 && error.rateLimitCode)) return { category: "rate_limit", message: error.message, retryable: status === 429, retryAfterMs: error.retryAfterMs, providerStatus: status };
    if (status === 404) return { category: "unavailable", message: error.message, retryable: false, retryAfterMs: null, providerStatus: status };
    if ([408, 409, 425, 500, 502, 503, 504].includes(status)) return { category: status === 408 || status === 504 ? "timeout" : "transient", message: error.message, retryable: true, retryAfterMs: error.retryAfterMs, providerStatus: status };
    if (status >= 400 && status < 500) return { category: "invalid_request", message: error.message, retryable: false, retryAfterMs: null, providerStatus: status };
    return { category: "unavailable", message: error.message, retryable: true, retryAfterMs: error.retryAfterMs, providerStatus: status };
  }
  const message = globalRedactor.redactText(error instanceof Error ? error.message : String(error));
  if (/timeout|timed out/i.test(message)) return { category: "timeout", message, retryable: true, retryAfterMs: null, providerStatus: null };
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(message)) return { category: "unavailable", message, retryable: true, retryAfterMs: null, providerStatus: null };
  return { category: "unknown", message, retryable: false, retryAfterMs: null, providerStatus: null };
}

function ipv4Parts(address: string): [number, number, number, number] | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts as [number, number, number, number];
}

function ipv6Value(address: string): bigint | null {
  let normalized = address.toLowerCase().split("%")[0]!;
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const embedded = ipv4Parts(normalized.slice(separator + 1));
    if (!embedded) return null;
    normalized = `${normalized.slice(0, separator)}:${((embedded[0] << 8) | embedded[1]).toString(16)}:${((embedded[2] << 8) | embedded[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function inIpv6Cidr(value: bigint, base: bigint, prefix: number): boolean {
  const shift = 128n - BigInt(prefix);
  return (value >> shift) === (base >> shift);
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  const parts = ipv4Parts(normalized);
  if (parts) {
    const [a, b, c] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  const value = ipv6Value(normalized);
  if (value === null) return false;
  if (value <= 1n || (value >> 32n) === 0xffffn || (value >> 32n) === 0n) return true;
  if ((value >> 125n) !== 1n) return true; // Only global-unicast 2000::/3 is eligible remotely.
  for (const [base, prefix] of [["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28], ["2001:db8::", 32], ["2002::", 16]] as const) {
    const baseValue = ipv6Value(base);
    if (baseValue !== null && inIpv6Cidr(value, baseValue, prefix)) return true;
  }
  return false;
}

function guardedLookup(allowLoopback: boolean): LookupFunction {
  return ((hostname: string, options: unknown, callback: (...args: unknown[]) => void): void => {
    const normalizedOptions = typeof options === "number" ? { family: options } : (options && typeof options === "object" ? options as Record<string, unknown> : {});
    dnsLookup(hostname, { ...normalizedOptions, all: true, verbatim: true }, (error, addresses) => {
      if (error) { callback(error); return; }
      try {
        const safe = addresses.filter((item) => {
          const blocked = isPrivateAddress(item.address);
          if (!blocked) return true;
          return allowLoopback && ["127.0.0.1", "::1", "0:0:0:0:0:0:0:1"].includes(item.address.toLowerCase());
        });
        if (safe.length !== addresses.length || safe.length === 0) throw new SafeError("SSRF_BLOCKED", "Provider DNS resolution included a non-public address", 400);
        if (normalizedOptions.all === true) callback(null, safe);
        else callback(null, safe[0]!.address, safe[0]!.family);
      } catch (lookupError) { callback(lookupError); }
    });
  }) as LookupFunction;
}

export async function assertSafeResolvedUrl(url: URL, allowLoopback: boolean): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(hostname);
  if (literal && isPrivateAddress(hostname) && !allowLoopback) {
    throw new SafeError("SSRF_BLOCKED", "Provider hostname resolves to a private address", 400);
  }
  if (!isSafeProviderBaseUrl(url, allowLoopback)) throw new SafeError("SSRF_BLOCKED", "Provider base URL violates the outbound URL policy", 400);
  const addresses = literal ? [{ address: hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new SafeError("SSRF_BLOCKED", "Provider hostname did not resolve", 400);
  for (const item of addresses) {
    const privateAddress = isPrivateAddress(item.address);
    if (privateAddress && !allowLoopback) throw new SafeError("SSRF_BLOCKED", "Provider hostname resolves to a private address", 400);
    if (allowLoopback && privateAddress && !["127.0.0.1", "::1", "0:0:0:0:0:0:0:1"].includes(item.address.toLowerCase())) throw new SafeError("SSRF_BLOCKED", "Local providers may resolve only to loopback", 400);
  }
}

interface HttpTransportOptions {
  baseUrl: string;
  headers: () => Record<string, string>;
  allowLoopback: boolean;
  fetchImpl?: FetchLike | undefined;
  skipDnsValidationForTests?: boolean | undefined;
}

export class HttpTransport {
  readonly base: URL;
  readonly #headers: () => Record<string, string>;
  readonly #allowLoopback: boolean;
  readonly #fetch: FetchLike;
  readonly #skipDnsValidation: boolean;
  readonly #dispatcher: Agent | null;

  constructor(options: HttpTransportOptions) {
    this.base = new URL(options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`);
    this.#headers = options.headers;
    this.#allowLoopback = options.allowLoopback;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#skipDnsValidation = options.skipDnsValidationForTests === true;
    this.#dispatcher = options.fetchImpl || this.#skipDnsValidation ? null : new Agent({ connect: { lookup: guardedLookup(this.#allowLoopback) } });
  }

  async request(providerId: string, path: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(path.replace(/^\//, ""), this.base);
    if (url.origin !== this.base.origin) throw new SafeError("SSRF_BLOCKED", "Provider request escaped the configured origin");
    if (!this.#skipDnsValidation) await assertSafeResolvedUrl(this.base, this.#allowLoopback);
    const requestInit = {
      ...init,
      redirect: "error",
      headers: { ...this.#headers(), ...(init.headers as Record<string, string> | undefined) },
      ...(this.#dispatcher ? { dispatcher: this.#dispatcher } : {}),
    } as RequestInit;
    const response = await this.#fetch(url, requestInit);
    if (!response.ok) {
      const body = globalRedactor.redactText((await response.text()).slice(0, 1000));
      throw new ProviderHttpError(providerId, response.status, parseRetryAfter(response.headers.get("retry-after")), body || response.statusText);
    }
    return response;
  }
}

async function* parseSse(response: Response): AsyncGenerator<{ event: string; data: string }> {
  if (!response.body) throw new SafeError("PROVIDER_STREAM_INVALID", "Provider returned no stream body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  const emit = (): { event: string; data: string } | null => {
    if (data.length === 0) { event = "message"; return null; }
    const value = { event, data: data.join("\n") };
    event = "message";
    data = [];
    return value;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (!line) { const valueToEmit = emit(); if (valueToEmit) yield valueToEmit; }
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
    }
    const valueToEmit = emit();
    if (valueToEmit) yield valueToEmit;
  } finally { reader.releaseLock(); }
}

abstract class BaseProvider implements ProviderAdapter {
  abstract readonly id: string;
  abstract readonly supportsStreaming: boolean;
  abstract listModels(signal?: AbortSignal): Promise<ProviderModel[]>;
  abstract healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
  abstract generate(request: GenerateRequest): Promise<GenerateResult>;
  abstract stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent>;
  async cancel(_responseId: string): Promise<void> { /* provider-specific best effort */ }
  classifyError(error: unknown): ProviderErrorShape { return classifyProviderError(this.id, error); }
}

export interface ProviderConstructorOptions {
  id: string;
  baseUrl: string;
  apiKey?: string | undefined;
  fetchImpl?: FetchLike | undefined;
  skipDnsValidationForTests?: boolean | undefined;
}

export interface McpStdioSpec {
  command: string;
  args: string[];
  cwd?: string | undefined;
}

export interface McpToolResult {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
}

export type McpToolCaller = (spec: McpStdioSpec, name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<McpToolResult>;

function inheritedMcpEnvironment(): NodeJS.ProcessEnv {
  const names = process.platform === "win32"
    ? ["APPDATA", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PATH", "PROCESSOR_ARCHITECTURE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERNAME", "USERPROFILE", "PROGRAMFILES"]
    : ["HOME", "LOGNAME", "PATH", "SHELL", "TERM"];
  const env: NodeJS.ProcessEnv = {};
  for (const name of [...names, "CLAUDE_CDP_ENDPOINT"]) if (process.env[name] !== undefined && !process.env[name]!.startsWith("()")) env[name] = process.env[name];
  return env;
}

export const callMcpStdioTool: McpToolCaller = async (spec, name, args, signal) => {
  if (signal.aborted) throw signal.reason;
  const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: inheritedMcpEnvironment(), shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  let stderr = "";
  let settled = false;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();
  const rejectPending = (error: unknown): void => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const processLine = (line: string): void => {
    if (!line.trim()) return;
    let message: { id?: unknown; result?: unknown; error?: { message?: unknown } };
    try { message = JSON.parse(line) as typeof message; }
    catch { rejectPending(new SafeError("MCP_PROTOCOL_ERROR", "Claude adapter returned invalid JSON-RPC")); return; }
    if (typeof message.id !== "number") return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new SafeError("MCP_TOOL_ERROR", typeof message.error.message === "string" ? message.error.message : "Claude adapter MCP request failed", 502));
    else request.resolve(message.result);
  };
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    if (buffer.length > 10 * 1024 * 1024) { rejectPending(new SafeError("MCP_PROTOCOL_ERROR", "Claude adapter response exceeded 10 MB")); child.kill(); return; }
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      processLine(line);
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 65_536) stderr += chunk.toString("utf8"); });
  const abort = (): void => {
    const error = signal.reason ?? new DOMException("Claude adapter request was cancelled", "AbortError");
    rejectPending(error);
    child.kill();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const onSpawn = (): void => { child.off("error", onError); resolvePromise(); };
      const onError = (error: Error): void => { child.off("spawn", onSpawn); reject(error); };
      child.once("spawn", onSpawn);
      child.once("error", onError);
    });
    child.once("error", rejectPending);
    child.once("close", (code) => {
      if (pending.size > 0) rejectPending(new SafeError("MCP_PROCESS_EXITED", `Claude adapter exited with code ${code ?? "unknown"}${stderr.trim() ? `: ${globalRedactor.redactText(stderr.trim())}` : ""}`, 503));
    });
    const request = (id: number, method: string, params: Record<string, unknown>): Promise<unknown> => new Promise((resolvePromise, reject) => {
      pending.set(id, { resolve: resolvePromise, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => { if (error) { pending.delete(id); reject(error); } });
    });
    await request(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "omniroute", version: "0.4.0" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const result = await request(2, "tools/call", { name, arguments: args });
    settled = true;
    return result as McpToolResult;
  } finally {
    signal.removeEventListener("abort", abort);
    try { child.stdin.end(); } catch { /* process may already be closed */ }
    if (!settled) rejectPending(new SafeError("MCP_PROCESS_EXITED", "Claude adapter request did not complete", 503));
    if (child.exitCode === null) child.kill();
  }
};

export interface ClaudeConsumerProviderOptions extends McpStdioSpec {
  id: string;
  callTool?: McpToolCaller | undefined;
}

export class ClaudeConsumerProvider extends BaseProvider {
  readonly supportsStreaming = false;
  readonly id: string;
  readonly #spec: McpStdioSpec;
  readonly #callTool: McpToolCaller;

  constructor(options: ClaudeConsumerProviderOptions) {
    super();
    if (!options.command || options.args.length === 0) throw new SafeError("PROVIDER_COMMAND_MISSING", `${options.id} requires an MCP stdio command and arguments`);
    this.id = options.id;
    this.#spec = { command: options.command, args: [...options.args], cwd: options.cwd };
    this.#callTool = options.callTool ?? callMcpStdioTool;
  }

  async listModels(_signal?: AbortSignal): Promise<ProviderModel[]> {
    return [{ id: "claude-web-consumer", name: "Claude Web Consumer", createdAt: null, contextWindow: 32_768, maxOutputTokens: 4_096, capabilities: { text: true, coding: true, toolCalling: false, structuredOutput: false, web: false }, reasoningEfforts: ["none"] }];
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const result = await this.#callTool(this.#spec, "test_connection", {}, signal ?? AbortSignal.timeout(60_000));
      const payload = this.payload(result);
      if (payload.status !== "ready") throw new SafeError("CLAUDE_CONSUMER_UNAVAILABLE", typeof payload.message === "string" ? payload.message : "Claude browser session is not ready", 503);
      return { status: "healthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: null };
    } catch (error) {
      return { status: "unhealthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: this.classifyError(error).message };
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (request.modelId !== "claude-web-consumer") throw new SafeError("PROVIDER_MODEL_MISSING", `${this.id} does not expose ${request.modelId}`, 404);
    if (request.jsonSchema) throw new SafeError("PROVIDER_CAPABILITY_MISMATCH", "Claude consumer adapter does not support structured output");
    // This adapter types into a consumer chat, so send only the user's request.
    // Provider-style system directives look unnatural there and can trigger
    // misleading prompt-injection titles or warnings.
    const prompt = request.prompt;
    const payload = this.payload(await this.#callTool(this.#spec, "claude_query", { prompt }, request.signal));
    if (typeof payload.output !== "string" || !payload.output) throw new SafeError("PROVIDER_RESPONSE_INVALID", "Claude adapter returned no output", 502);
    const estimatedTotal = typeof (payload.usage as { estimatedTokens?: unknown } | undefined)?.estimatedTokens === "number" ? Math.max(0, Math.ceil((payload.usage as { estimatedTokens: number }).estimatedTokens)) : null;
    const inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
    const outputTokens = estimatedTotal === null ? Math.max(1, Math.ceil(payload.output.length / 4)) : Math.max(0, estimatedTotal - inputTokens);
    return { text: payload.output, responseId: null, usage: { inputTokens, outputTokens, cachedInputTokens: 0, estimatedCostUsd: 0, measurement: "estimated" } };
  }

  async *stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent> {
    const result = await this.generate(request);
    yield { type: "start", responseId: null };
    yield { type: "delta", text: result.text };
    yield { type: "usage", usage: result.usage };
    yield { type: "done", responseId: null };
  }

  override classifyError(error: unknown): ProviderErrorShape {
    if (error instanceof SafeError && ["CLAUDE_CONSUMER_UNAVAILABLE", "MCP_PROCESS_EXITED", "MCP_TOOL_ERROR"].includes(error.code)) return { category: "unavailable", message: error.message, retryable: true, retryAfterMs: null, providerStatus: null };
    return super.classifyError(error);
  }

  private payload(result: McpToolResult): Record<string, unknown> {
    const text = result.content?.find((item) => item.type === "text" && typeof item.text === "string")?.text;
    let payload: Record<string, unknown> = {};
    try { payload = text ? JSON.parse(text) as Record<string, unknown> : {}; }
    catch { throw new SafeError("PROVIDER_RESPONSE_INVALID", "Claude adapter returned invalid JSON", 502); }
    if (result.isError) throw new SafeError("CLAUDE_CONSUMER_UNAVAILABLE", typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "Claude adapter request failed", 503);
    return payload;
  }
}

export class OpenAIProvider extends BaseProvider {
  readonly supportsStreaming = true;
  readonly id: string;
  readonly #http: HttpTransport;

  constructor(options: ProviderConstructorOptions) {
    super();
    this.id = options.id;
    if (!options.apiKey) throw new SafeError("PROVIDER_CREDENTIAL_MISSING", `No API credential is configured for ${options.id}`);
    globalRedactor.register(options.apiKey);
    const apiKey = options.apiKey;
    this.#http = new HttpTransport({ baseUrl: options.baseUrl, allowLoopback: false, fetchImpl: options.fetchImpl, skipDnsValidationForTests: options.skipDnsValidationForTests, headers: () => ({ authorization: `Bearer ${apiKey}`, "content-type": "application/json" }) });
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const response = await this.#http.request(this.id, "v1/models", { signal: signal ?? null });
    const body = await response.json() as { data?: Array<{ id?: string; created?: number }> };
    return (body.data ?? []).filter((item): item is { id: string; created?: number } => typeof item.id === "string").map((item) => ({
      id: item.id,
      name: item.id,
      createdAt: item.created ? new Date(item.created * 1000).toISOString() : null,
      contextWindow: null,
      maxOutputTokens: null,
      capabilities: {},
      reasoningEfforts: [],
    }));
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const models = await this.listModels(signal);
      const hasSol = models.some((model) => model.id === ORCHESTRATOR_MODEL_ID);
      return { status: hasSol ? "healthy" : "unhealthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: hasSol ? null : `${ORCHESTRATOR_MODEL_ID} is not available to this credential` };
    } catch (error) {
      return { status: "unhealthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: this.classifyError(error).message };
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const response = await this.#http.request(this.id, "v1/responses", { method: "POST", signal: request.signal, body: JSON.stringify(this.body(request, false)) });
    const data = await response.json() as {
      id?: string;
      output_text?: string;
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
    };
    const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("") ?? "";
    return { text, responseId: data.id ?? null, usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0, cachedInputTokens: data.usage?.input_tokens_details?.cached_tokens ?? 0, estimatedCostUsd: null, measurement: data.usage ? "provider-reported" : "unavailable" } };
  }

  async *stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent> {
    const response = await this.#http.request(this.id, "v1/responses", { method: "POST", signal: request.signal, body: JSON.stringify(this.body(request, true)), headers: { accept: "text/event-stream" } });
    let responseId: string | null = null;
    let completed = false;
    yield { type: "start", responseId };
    for await (const event of parseSse(response)) {
      if (event.data === "[DONE]") break;
      let data: Record<string, unknown>;
      try { data = JSON.parse(event.data) as Record<string, unknown>; } catch { continue; }
      const type = typeof data.type === "string" ? data.type : event.event;
      if (type === "response.created" && typeof (data.response as Record<string, unknown> | undefined)?.id === "string") {
        responseId = (data.response as { id: string }).id;
        yield { type: "start", responseId };
      }
      if (type === "response.output_text.delta" && typeof data.delta === "string") yield { type: "delta", text: data.delta };
      if (type === "response.completed") {
        completed = true;
        const completedResponse = data.response as { id?: string; usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } } | undefined;
        responseId = completedResponse?.id ?? responseId;
        yield { type: "usage", usage: { inputTokens: completedResponse?.usage?.input_tokens ?? 0, outputTokens: completedResponse?.usage?.output_tokens ?? 0, cachedInputTokens: completedResponse?.usage?.input_tokens_details?.cached_tokens ?? 0, estimatedCostUsd: null, measurement: completedResponse?.usage ? "provider-reported" : "unavailable" } };
      }
      if (type === "error" || type === "response.failed") throw new SafeError("PROVIDER_STREAM_FAILED", `${this.id} stream failed after partial output`);
    }
    if (!completed) throw new SafeError("PROVIDER_STREAM_TRUNCATED", `${this.id} stream ended without response.completed`);
    yield { type: "done", responseId };
  }

  override async cancel(responseId: string): Promise<void> {
    await this.#http.request(this.id, `v1/responses/${encodeURIComponent(responseId)}/cancel`, { method: "POST", body: "{}" });
  }

  private body(request: GenerateRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.modelId,
      instructions: request.instructions,
      input: request.prompt,
      reasoning: { effort: request.reasoningEffort },
      max_output_tokens: request.maxOutputTokens,
      store: false,
      stream,
    };
    if (request.safetyIdentifier) body.safety_identifier = request.safetyIdentifier;
    if (request.jsonSchema) body.text = { format: { type: "json_schema", name: request.schemaName ?? "structured_response", strict: true, schema: request.jsonSchema } };
    return body;
  }
}

export class AnthropicProvider extends BaseProvider {
  readonly supportsStreaming = true;
  readonly id: string;
  readonly #http: HttpTransport;

  constructor(options: ProviderConstructorOptions) {
    super();
    this.id = options.id;
    if (!options.apiKey) throw new SafeError("PROVIDER_CREDENTIAL_MISSING", `No API credential is configured for ${options.id}`);
    globalRedactor.register(options.apiKey);
    const apiKey = options.apiKey;
    this.#http = new HttpTransport({ baseUrl: options.baseUrl, allowLoopback: false, fetchImpl: options.fetchImpl, skipDnsValidationForTests: options.skipDnsValidationForTests, headers: () => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }) });
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const response = await this.#http.request(this.id, "v1/models?limit=1000", { signal: signal ?? null });
    const body = await response.json() as { data?: Array<{ id?: string; display_name?: string; created_at?: string; max_input_tokens?: number | null; max_tokens?: number | null; capabilities?: Record<string, boolean> | null }> };
    return (body.data ?? []).filter((item): item is NonNullable<typeof item> & { id: string } => typeof item.id === "string").map((item) => ({
      id: item.id,
      name: item.display_name ?? item.id,
      createdAt: item.created_at ?? null,
      contextWindow: item.max_input_tokens ?? null,
      maxOutputTokens: item.max_tokens ?? null,
      capabilities: {
        text: true,
        imageInput: item.capabilities?.vision ?? null,
        toolCalling: item.capabilities?.tool_use ?? null,
        structuredOutput: item.capabilities?.structured_outputs ?? null,
      },
      reasoningEfforts: item.capabilities?.adaptive_thinking ? ["low", "medium", "high"] : ["none"],
    }));
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    const started = Date.now();
    try { await this.listModels(signal); return { status: "healthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: null }; }
    catch (error) { return { status: "unhealthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: this.classifyError(error).message }; }
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (request.jsonSchema) throw new SafeError("PROVIDER_CAPABILITY_MISMATCH", "Anthropic adapter does not claim Responses structured-output compatibility");
    const response = await this.#http.request(this.id, "v1/messages", { method: "POST", signal: request.signal, body: JSON.stringify(this.body(request, false)) });
    const data = await response.json() as { id?: string; content?: Array<{ type?: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
    return { text: data.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "", responseId: data.id ?? null, usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0, cachedInputTokens: data.usage?.cache_read_input_tokens ?? 0, estimatedCostUsd: null, measurement: data.usage ? "provider-reported" : "unavailable" } };
  }

  async *stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent> {
    const response = await this.#http.request(this.id, "v1/messages", { method: "POST", signal: request.signal, body: JSON.stringify(this.body(request, true)), headers: { accept: "text/event-stream" } });
    let responseId: string | null = null;
    let inputTokens = 0;
    let completed = false;
    yield { type: "start", responseId };
    for await (const event of parseSse(response)) {
      let data: Record<string, unknown>;
      try { data = JSON.parse(event.data) as Record<string, unknown>; } catch { continue; }
      if (event.event === "message_start") {
        const message = data.message as { id?: string; usage?: { input_tokens?: number } } | undefined;
        responseId = message?.id ?? null;
        inputTokens = message?.usage?.input_tokens ?? 0;
        if (responseId) yield { type: "start", responseId };
      }
      if (event.event === "content_block_delta") {
        const delta = data.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) yield { type: "delta", text: delta.text };
      }
      if (event.event === "message_delta") {
        const usage = data.usage as { output_tokens?: number } | undefined;
        yield { type: "usage", usage: { inputTokens, outputTokens: usage?.output_tokens ?? 0, cachedInputTokens: 0, estimatedCostUsd: null, measurement: usage ? "provider-reported" : "unavailable" } };
      }
      if (event.event === "message_stop") completed = true;
      if (event.event === "error") throw new SafeError("PROVIDER_STREAM_FAILED", `${this.id} stream failed after partial output`);
    }
    if (!completed) throw new SafeError("PROVIDER_STREAM_TRUNCATED", `${this.id} stream ended without message_stop`);
    yield { type: "done", responseId };
  }

  private body(request: GenerateRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = { model: request.modelId, system: request.instructions, messages: [{ role: "user", content: request.prompt }], max_tokens: request.maxOutputTokens, stream };
    if (request.reasoningEffort !== "none") body.thinking = { type: "adaptive" };
    return body;
  }
}

interface CompatibilityOptions {
  modelsPath?: string;
  modelsFormat?: "cohere" | "cloudflare";
  staticModels?: string[];
  omitStreamOptions?: boolean;
  cohereSchema?: boolean;
  disableThinking?: boolean;
}

function throwCompatiblePayloadError(providerId: string, error: unknown): void {
  if (!error) return;
  const item = typeof error === "object" ? error as { code?: unknown; type?: unknown; message?: unknown; status?: unknown } : {};
  const code = String(item.code ?? item.type ?? "").toLowerCase();
  const status = Number(item.status ?? item.code);
  if (status === 429 || status === 402 || ["rate_limit_exceeded", "rate_limit_error", "insufficient_quota", "quota_exceeded"].includes(code)) throw new ProviderHttpError(providerId, status === 402 ? 402 : 429, null, "Provider reported a quota or rate limit in its response");
  throw new SafeError("PROVIDER_RESPONSE_ERROR", `${providerId} returned an error response`);
}

export class OpenAICompatibleProvider extends BaseProvider {
  readonly supportsStreaming = true;
  readonly id: string;
  protected readonly http: HttpTransport;
  readonly #apiPrefix: string;
  readonly #compatibility: CompatibilityOptions;

  constructor(options: ProviderConstructorOptions & { allowLoopback?: boolean; apiPrefix?: string; compatibility?: CompatibilityOptions }) {
    super();
    this.id = options.id;
    if (options.apiKey) globalRedactor.register(options.apiKey);
    const apiKey = options.apiKey;
    this.#apiPrefix = options.apiPrefix ?? "v1/";
    this.#compatibility = options.compatibility ?? {};
    this.http = new HttpTransport({ baseUrl: options.baseUrl, allowLoopback: options.allowLoopback === true, fetchImpl: options.fetchImpl, skipDnsValidationForTests: options.skipDnsValidationForTests, headers: () => ({ ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}), "content-type": "application/json" }) });
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    let items: Array<{ id?: string | undefined; name?: string; created?: number }>;
    if (this.#compatibility.staticModels) items = this.#compatibility.staticModels.map((id) => ({ id }));
    else {
      const response = await this.http.request(this.id, this.#compatibility.modelsPath ?? `${this.#apiPrefix}models`, { signal: signal ?? null });
      const body = await response.json() as { data?: typeof items; models?: typeof items; result?: typeof items; success?: boolean };
      if (body.success === false) throw new SafeError("PROVIDER_DISCOVERY_FAILED", `${this.id} rejected model discovery`);
      const rows = this.#compatibility.modelsFormat === "cohere" ? body.models : this.#compatibility.modelsFormat === "cloudflare" ? body.result : body.data;
      if (!Array.isArray(rows)) throw new SafeError("PROVIDER_DISCOVERY_FAILED", `${this.id} returned an invalid model catalog`);
      items = rows.map((item) => {
        let id = this.#compatibility.modelsFormat ? item.name : item.id;
        // Google's OpenAI catalog uses resource names, while chat requests use bare IDs.
        if (this.id === "gemini" && typeof id === "string") id = id.replace(/^models\//, "");
        return { ...item, id };
      });
    }
    return items.filter((item): item is { id: string; created?: number } => typeof item.id === "string").map((item) => ({ id: item.id, name: item.id, createdAt: item.created ? new Date(item.created * 1000).toISOString() : null, contextWindow: null, maxOutputTokens: null, capabilities: {}, reasoningEfforts: ["none"] }));
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      if (this.#compatibility.staticModels) {
        let lastError: unknown = new SafeError("PROVIDER_MODEL_MISSING", "No probe model configured");
        let available = false;
        for (const modelId of this.#compatibility.staticModels) {
          try {
            await this.generate({ modelId, instructions: "Reply briefly.", prompt: "Hi", maxOutputTokens: 16, reasoningEffort: "none", jsonSchema: null, schemaName: null, safetyIdentifier: null, signal: signal ?? AbortSignal.timeout(15_000) });
            available = true; break;
          } catch (error) {
            lastError = error;
            if (signal?.aborted || !["rate_limit", "transient", "timeout", "unavailable"].includes(this.classifyError(error).category)) throw error;
          }
        }
        if (!available) throw lastError;
      } else await this.listModels(signal);
      return { status: "healthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: null };
    }
    catch (error) { return { status: "unhealthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: this.classifyError(error).message }; }
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const response = await this.http.request(this.id, `${this.#apiPrefix}chat/completions`, { method: "POST", signal: request.signal, body: JSON.stringify(this.body(request, false)) });
    const data = await response.json() as { error?: unknown; id?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
    throwCompatiblePayloadError(this.id, data.error);
    if (!data.choices?.[0]?.message) throw new SafeError("PROVIDER_RESPONSE_INVALID", `${this.id} returned no completion`);
    return { text: data.choices?.[0]?.message?.content ?? "", responseId: data.id ?? null, usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0, cachedInputTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0, estimatedCostUsd: null, measurement: data.usage ? "provider-reported" : "unavailable" } };
  }

  async *stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent> {
    const response = await this.http.request(this.id, `${this.#apiPrefix}chat/completions`, { method: "POST", signal: request.signal, body: JSON.stringify(this.body(request, true)), headers: { accept: "text/event-stream" } });
    let responseId: string | null = null;
    let completed = false;
    yield { type: "start", responseId };
    for await (const event of parseSse(response)) {
      if (event.data === "[DONE]") { completed = true; break; }
      let data: { error?: unknown; id?: string; choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      try { data = JSON.parse(event.data) as typeof data; } catch { continue; }
      throwCompatiblePayloadError(this.id, data.error);
      if (data.id && data.id !== responseId) { responseId = data.id; yield { type: "start", responseId }; }
      const text = data.choices?.[0]?.delta?.content;
      if (text) yield { type: "delta", text };
      if (data.usage) yield { type: "usage", usage: { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0, cachedInputTokens: 0, estimatedCostUsd: null, measurement: "provider-reported" } };
    }
    if (!completed) throw new SafeError("PROVIDER_STREAM_TRUNCATED", `${this.id} stream ended without [DONE]`);
    yield { type: "done", responseId };
  }

  private body(request: GenerateRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = { model: request.modelId, messages: [{ role: "system", content: request.instructions }, { role: "user", content: request.prompt }], max_tokens: request.maxOutputTokens, stream };
    if (request.jsonSchema) body.response_format = this.#compatibility.cohereSchema ? { type: "json_object", schema: request.jsonSchema } : { type: "json_schema", json_schema: { name: request.schemaName ?? "structured_response", strict: true, schema: request.jsonSchema } };
    if (stream && !this.#compatibility.omitStreamOptions) body.stream_options = { include_usage: true };
    if (this.#compatibility.disableThinking) body.thinking = { type: "disabled" };
    return body;
  }
}

export class LocalProvider extends OpenAICompatibleProvider {
  constructor(options: Omit<ProviderConstructorOptions, "apiKey">) {
    super({ ...options, allowLoopback: true });
  }
}

export interface ProviderFactoryOptions {
  credentials: Record<string, Record<string, string>>;
  fetchImpl?: FetchLike | undefined;
  skipDnsValidationForTests?: boolean | undefined;
  mcpToolCaller?: McpToolCaller | undefined;
}

export function createConfiguredProvider(settings: ProviderSettings, credential: Readonly<Record<string, string>>, options: Omit<ProviderFactoryOptions, "credentials"> = {}): ProviderAdapter {
  const apiKey = settings.credentialField ? credential[settings.credentialField] : undefined;
  if (settings.type !== "local" && settings.credentialField && !apiKey) throw new SafeError("PROVIDER_CREDENTIAL_MISSING", `${settings.id} requires a credential`);
  const profile = EXTRA_FREE_PROVIDERS.find((item) => item.id === settings.id);
  if (profile && settings.freeTierConfirmed !== true) throw new SafeError("FREE_TIER_CONFIRMATION_REQUIRED", `${settings.id}: confirm a free-only account with omni providers enable ${settings.id} --confirm-free-tier before importing or using its key`, 400);
  const common = { id: settings.id, baseUrl: settings.baseUrl, apiPrefix: settings.apiPrefix, fetchImpl: options.fetchImpl, skipDnsValidationForTests: options.skipDnsValidationForTests };
  if (settings.type === "mcp-stdio") return new ClaudeConsumerProvider({ id: settings.id, command: settings.mcpCommand ?? "", args: settings.mcpArgs ?? [], cwd: settings.mcpWorkingDirectory, callTool: options.mcpToolCaller });
  if (settings.type === "openai") return new OpenAIProvider({ ...common, apiKey });
  if (settings.type === "anthropic") return new AnthropicProvider({ ...common, apiKey });
  if (settings.type === "local") return new LocalProvider(common);
  const compatibility: CompatibilityOptions = { omitStreamOptions: !!profile };
  if (settings.id === "cohere") Object.assign(compatibility, { modelsPath: "v1/models?page_size=1000", modelsFormat: "cohere", cohereSchema: true });
  if (settings.id === "cloudflare") {
    const accountId = credential.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId)) throw new SafeError("PROVIDER_CREDENTIAL_MISSING", "Cloudflare requires a 32-character hexadecimal account ID", 400);
    common.apiPrefix = `client/v4/accounts/${accountId}/ai/v1/`;
    compatibility.modelsPath = `client/v4/accounts/${accountId}/ai/models/search?per_page=1000`;
    compatibility.modelsFormat = "cloudflare";
  }
  if (settings.id === "zai") Object.assign(compatibility, { staticModels: settings.models.filter((model) => model.enabled && model.allowed).map((model) => model.modelId), disableThinking: true });
  return new OpenAICompatibleProvider({ ...common, apiKey, compatibility });
}

export function createProviders(config: OmniConfig, options: ProviderFactoryOptions): Map<string, ProviderAdapter> {
  const providers = new Map<string, ProviderAdapter>();
  for (const settings of config.providers.filter((provider) => provider.enabled)) {
    const credential = options.credentials[settings.id] ?? {};
    try {
      providers.set(settings.id, createConfiguredProvider(settings, credential, options));
    } catch (error) {
      if (!(error instanceof SafeError) || error.code !== "PROVIDER_CREDENTIAL_MISSING") throw error;
    }
  }
  return providers;
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  text: null,
  imageInput: null,
  imageOutput: null,
  audioInput: null,
  audioOutput: null,
  toolCalling: null,
  structuredOutput: null,
  web: null,
  coding: null,
};

function applyConfiguredCapabilities(base: ModelCapabilities, settings: ProviderSettings["models"][number]): ModelCapabilities {
  const result = { ...base };
  const map: Partial<Record<keyof ModelCapabilities, boolean | null | undefined>> = {
    text: settings.capabilities.text,
    imageInput: settings.capabilities.vision,
    toolCalling: settings.capabilities.tool_calling,
    structuredOutput: settings.capabilities.structured_output,
    web: settings.capabilities.web,
    coding: settings.capabilities.coding,
  };
  for (const [key, value] of Object.entries(map) as Array<[keyof ModelCapabilities, boolean | undefined]>) if (value !== undefined) result[key] = value;
  return result;
}

export async function buildRegistry(config: OmniConfig, providers: Map<string, ProviderAdapter>, signal?: AbortSignal): Promise<RegistrySnapshot> {
  const models: ModelEntry[] = [];
  const now = new Date().toISOString();
  for (const settings of config.providers.filter((provider) => provider.enabled)) {
    const provider = providers.get(settings.id);
    if (!provider) continue;
    const health = await provider.healthCheck(signal);
    let discovered: ProviderModel[] = [];
    try { discovered = health.status === "healthy" ? await provider.listModels(signal) : []; } catch { /* health already records failure */ }
    const discoveredById = new Map(discovered.map((model) => [model.id, model]));
    const hasDiscovery = discovered.length > 0;
    for (const override of settings.models) {
      const item = discoveredById.get(override.modelId);
      const virtualModel = settings.id === "openrouter" && override.modelId === "openrouter/free";
      const modelHealth = health.status === "healthy" && (!hasDiscovery || item || virtualModel) ? "healthy" : health.status === "healthy" ? "unhealthy" : health.status;
      const discoveredCapabilities = { ...DEFAULT_CAPABILITIES, ...(item?.capabilities ?? {}) };
      models.push({
        providerId: settings.id,
        modelId: override.modelId,
        name: item?.name ?? override.modelId,
        enabled: override.enabled,
        allowed: override.allowed,
        health: { status: modelHealth, checkedAt: health.checkedAt, latencyMs: health.latencyMs, message: modelHealth === "unhealthy" && health.status === "healthy" ? "Configured model was not returned by discovery" : health.message },
        capabilities: applyConfiguredCapabilities(discoveredCapabilities, override),
        contextWindow: override.contextWindow ?? item?.contextWindow ?? null,
        maxOutputTokens: override.maxOutputTokens ?? item?.maxOutputTokens ?? null,
        reasoningEfforts: override.reasoningEfforts.length > 0 ? override.reasoningEfforts : item?.reasoningEfforts ?? [],
        intelligenceTier: override.intelligenceTier,
        latencyTier: override.latencyTier,
        pricing: { inputPerMillionUsd: override.inputPerMillionUsd, outputPerMillionUsd: override.outputPerMillionUsd, cachedInputPerMillionUsd: null, updatedAt: null },
        dataRegion: null,
        privacyLabels: [],
        rateLimitState: "unknown",
        discoveredAt: now,
        source: item ? "merged" : "override",
      });
    }
    const configuredIds = new Set(settings.models.map((model) => model.modelId));
    for (const item of discovered.filter((model) => !configuredIds.has(model.id))) {
      models.push({
        providerId: settings.id,
        modelId: item.id,
        name: item.name,
        enabled: false,
        allowed: false,
        health: { status: health.status, checkedAt: health.checkedAt, latencyMs: health.latencyMs, message: health.message },
        capabilities: { ...DEFAULT_CAPABILITIES, ...item.capabilities },
        contextWindow: item.contextWindow,
        maxOutputTokens: item.maxOutputTokens,
        reasoningEfforts: item.reasoningEfforts,
        intelligenceTier: null,
        latencyTier: null,
        pricing: { inputPerMillionUsd: null, outputPerMillionUsd: null, cachedInputPerMillionUsd: null, updatedAt: null },
        dataRegion: null,
        privacyLabels: [],
        rateLimitState: "unknown",
        discoveredAt: now,
        source: "discovered",
      });
    }
  }
  return { id: newRouteId(), createdAt: now, models };
}

export async function retryProviderCall<T>(
  provider: ProviderAdapter,
  operation: () => Promise<T>,
  options: { retries: number; baseDelayMs: number; maxDelayMs: number; signal: AbortSignal; onRetry?: (attempt: number, error: ProviderErrorShape) => void; skipRateLimitRetries?: boolean },
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      const classified = provider.classifyError(error);
      if (!classified.retryable || (options.skipRateLimitRetries && classified.category === "rate_limit") || attempt >= options.retries || options.signal.aborted) throw error;
      options.onRetry?.(attempt + 1, classified);
      const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attempt);
      const delay = classified.retryAfterMs ?? Math.round(exponential * (0.75 + Math.random() * 0.5));
      await new Promise<void>((resolvePromise, reject) => {
        const timer = setTimeout(resolvePromise, delay);
        options.signal.addEventListener("abort", () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
      });
    }
  }
}

export function calculateUsageCost(usage: Usage, model: ModelEntry): Usage {
  const inputPrice = model.pricing.inputPerMillionUsd;
  const outputPrice = model.pricing.outputPerMillionUsd;
  if (inputPrice === null || outputPrice === null) return { ...usage, estimatedCostUsd: null };
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const cachedPrice = model.pricing.cachedInputPerMillionUsd ?? inputPrice;
  return { ...usage, estimatedCostUsd: (uncached * inputPrice + usage.cachedInputTokens * cachedPrice + usage.outputTokens * outputPrice) / 1_000_000 };
}

export function providerSupportsEffort(model: ProviderModel, effort: ReasoningEffort): boolean {
  return model.reasoningEfforts.includes(effort) && REASONING_EFFORTS.includes(effort);
}

export { emptyUsage };
