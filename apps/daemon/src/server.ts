import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile, saveConfig } from "@omniroute/config";
import { CAPABILITIES, ROUTING_MODES, type Capability, type RouteEvent, type RouteRequest, type RoutingMode, type TaskState, type TaskSubmission, type TaskVerification } from "@omniroute/contracts";
import { DurableSessionStore, compactSessionMessages, TaskLifecycle, type SessionMessage } from "@omniroute/core";
import { globalRedactor, safeError, SafeError } from "@omniroute/observability";
import type { DaemonRuntime } from "./runtime.js";

interface BrowserSession { csrf: string; expiresAt: number }
interface OneTimeSession { sessionId: string; expiresAt: number }
interface AutomaticRouteTask { id: string; state: TaskState }

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function equalToken(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookies(request: IncomingMessage): Record<string, string> {
  const output: Record<string, string> = {};
  for (const item of (request.headers.cookie ?? "").split(";")) {
    const index = item.indexOf("=");
    if (index > 0) output[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
  }
  return output;
}

function sse(response: ServerResponse, event: string, value: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

export class OmniDaemonServer {
  readonly #runtime: DaemonRuntime;
  readonly #browserSessions = new Map<string, BrowserSession>();
  readonly #oneTimeSessions = new Map<string, OneTimeSession>();
  readonly #rate = new Map<string, number[]>();
  readonly #tasks: TaskLifecycle;
  readonly #sessions: DurableSessionStore;
  #activeRoutes = 0;
  #http: Server | null = null;
  #lock: NetServer | null = null;

  constructor(runtime: DaemonRuntime) {
    this.#runtime = runtime;
    this.#tasks = new TaskLifecycle(runtime.tasks);
    this.#sessions = new DurableSessionStore(runtime.paths.sessionsDir, { maxTokens: runtime.config.privacy.sessionMaxTokens, recentMessages: runtime.config.privacy.sessionRecentMessages, retentionDays: runtime.config.privacy.sessionRetentionDays });
  }

  async start(): Promise<{ host: string; port: number }> {
    await this.acquireLock();
    this.#http = createServer((request, response) => void this.handle(request, response));
    this.#http.requestTimeout = this.#runtime.config.daemon.routeTimeoutMs + 10_000;
    this.#http.headersTimeout = 10_000;
    await new Promise<void>((resolvePromise, reject) => {
      this.#http!.once("error", reject);
      this.#http!.listen(this.#runtime.config.daemon.port, this.#runtime.config.daemon.host, resolvePromise);
    });
    await atomicWriteFile(this.#runtime.paths.daemonState, `${JSON.stringify({ pid: process.pid, host: this.#runtime.config.daemon.host, port: this.#runtime.config.daemon.port, startedAt: new Date().toISOString() }, null, 2)}\n`);
    await this.#runtime.logger.write("info", "daemon.started", { host: this.#runtime.config.daemon.host, port: this.#runtime.config.daemon.port, pid: process.pid });
    return { host: this.#runtime.config.daemon.host, port: this.#runtime.config.daemon.port };
  }

  async stop(): Promise<void> {
    const close = (server: Server | NetServer | null): Promise<void> => new Promise((resolvePromise) => {
      if (!server) { resolvePromise(); return; }
      server.close(() => resolvePromise());
    });
    await Promise.all([close(this.#http), close(this.#lock)]);
    this.#http = null;
    this.#lock = null;
    await this.#runtime.logger.write("info", "daemon.stopped", { pid: process.pid });
  }

  createDashboardSessionUrl(): string {
    const nonce = randomBytes(24).toString("base64url");
    const sessionId = randomBytes(24).toString("base64url");
    this.#oneTimeSessions.set(nonce, { sessionId, expiresAt: Date.now() + 60_000 });
    return `http://${this.#runtime.config.daemon.host}:${this.#runtime.config.daemon.port}/_session/${nonce}`;
  }

  private async acquireLock(): Promise<void> {
    // Independent portable profiles must not lock out the user's other install.
    const root = process.platform === "win32" ? this.#runtime.paths.root.toLowerCase() : this.#runtime.paths.root;
    const discriminator = createHash("sha256").update(`${process.getuid?.() ?? process.env.USERNAME ?? "user"}\u0000${root}`).digest("hex").slice(0, 16);
    const path = process.platform === "win32" ? `\\\\.\\pipe\\omniroute-${discriminator}` : join(tmpdir(), `omniroute-${discriminator}.sock`);
    this.#lock = createNetServer((socket) => socket.end("OmniRoute\n"));
    await new Promise<void>((resolvePromise, reject) => {
      this.#lock!.once("error", (error: NodeJS.ErrnoException) => reject(error.code === "EADDRINUSE" ? new SafeError("DAEMON_ALREADY_RUNNING", "Another OmniRoute daemon instance is already running", 409) : error));
      this.#lock!.listen(path, resolvePromise);
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      this.validateHost(request);
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (request.method === "GET" && url.pathname.startsWith("/_session/")) { this.consumeOneTimeSession(url.pathname.slice("/_session/".length), response); return; }
      if (request.method === "GET" && url.pathname === "/v1/health") { this.json(response, 200, { status: "ok", version: "0.1.0", defaultMode: this.#runtime.config.routing.defaultMode, freeOnly: this.#runtime.config.routing.freeOnly, orchestrator: `${this.#runtime.config.routing.orchestratorProviderId}/${this.#runtime.config.routing.orchestratorModelId}` }); return; }
      if (!url.pathname.startsWith("/v1/")) { await this.serveDashboard(url.pathname, response); return; }
      const auth = this.authenticate(request);
      this.enforceRate(auth.identity);
      this.validateOriginAndCsrf(request, auth.session);

      if (request.method === "GET" && url.pathname === "/v1/session") { this.json(response, 200, { csrf: auth.session?.csrf ?? null }); return; }
      if (request.method === "POST" && url.pathname === "/v1/dashboard/session") {
        if (!auth.bearer) throw new SafeError("BEARER_REQUIRED", "Dashboard bootstrap requires bearer authentication", 401);
        this.json(response, 201, { url: this.createDashboardSessionUrl() }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/models") { this.json(response, 200, await this.#runtime.registry.current(url.searchParams.get("refresh") === "1")); return; }
      if (request.method === "GET" && url.pathname === "/v1/routes") { this.json(response, 200, { routes: await this.#runtime.audit.recent(Number(url.searchParams.get("limit") ?? 50)) }); return; }
      if (request.method === "GET" && url.pathname === "/v1/sessions") { this.json(response, 200, { sessions: this.#runtime.config.privacy.sessionFilesEnabled ? await this.#sessions.list() : [] }); return; }
      if (url.pathname.startsWith("/v1/sessions/") && request.method === "GET") { const id = this.sessionPathId(url.pathname); this.json(response, 200, { session: this.#runtime.config.privacy.sessionFilesEnabled ? await this.#sessions.load(id) : null }); return; }
      if (url.pathname.startsWith("/v1/sessions/") && request.method === "DELETE") { const id = this.sessionPathId(url.pathname); if (this.#runtime.config.privacy.sessionFilesEnabled) await this.#sessions.reset(id); this.json(response, 200, { reset: id }); return; }
      if (request.method === "GET" && url.pathname === "/v1/usage") { this.json(response, 200, { summary: await this.#runtime.audit.tokenSavingsSummary() }); return; }
      if (request.method === "GET" && url.pathname === "/v1/config") { this.json(response, 200, this.#runtime.config); return; }
      if (url.pathname === "/v1/tasks" && request.method === "POST") { this.json(response, 201, await this.#tasks.submit(await this.body(request) as TaskSubmission)); return; }
      if (url.pathname === "/v1/tasks" && request.method === "GET") { this.json(response, 200, { tasks: await this.#runtime.tasks.recover() }); return; }
      if (url.pathname.startsWith("/v1/tasks/")) { await this.handleTask(url, request, response); return; }
      if (request.method === "POST" && url.pathname === "/v1/service/stop") {
        this.json(response, 202, { status: "stopping" });
        setTimeout(() => process.kill(process.pid, "SIGTERM"), 50);
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/v1/budget") { await this.updateBudget(request, response); return; }
      if (request.method === "POST" && url.pathname === "/v1/routes") { await this.handleNativeRoute(request, response); return; }
      if (request.method === "POST" && url.pathname === "/v1/chat/completions") { await this.handleChatCompatibility(request, response); return; }
      if (request.method === "POST" && url.pathname === "/v1/responses") { await this.handleResponsesCompatibility(request, response); return; }
      throw new SafeError("NOT_FOUND", "Endpoint not found", 404);
    } catch (error) {
      if (response.headersSent) { if (!response.writableEnded) { const safe = safeError(error); sse(response, "error", { code: safe.code, message: safe.message, status: safe.status }); response.end(); } return; }
      const safe = safeError(error);
      this.json(response, safe.status, { error: { code: safe.code, message: safe.message } });
    }
  }

  private validateHost(request: IncomingMessage): void {
    const expected = `${this.#runtime.config.daemon.host}:${this.#runtime.config.daemon.port}`;
    if (request.headers.host !== expected) throw new SafeError("HOST_REJECTED", "Host header is not allowed", 403);
  }

  private authenticate(request: IncomingMessage): { identity: string; bearer: boolean; session: BrowserSession | null } {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ") && equalToken(authorization.slice(7), this.#runtime.token)) return { identity: "bearer", bearer: true, session: null };
    const sessionId = cookies(request).omniroute_session;
    const session = sessionId ? this.#browserSessions.get(sessionId) ?? null : null;
    if (session && session.expiresAt > Date.now()) return { identity: `session:${sessionId}`, bearer: false, session };
    throw new SafeError("AUTH_REQUIRED", "Local bearer or dashboard session authentication is required", 401);
  }

  private validateOriginAndCsrf(request: IncomingMessage, session: BrowserSession | null): void {
    const origin = request.headers.origin;
    if (origin && !this.#runtime.config.daemon.allowedOrigins.includes(origin)) throw new SafeError("ORIGIN_REJECTED", "Origin is not allowed", 403);
    if (session && request.method && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!origin || request.headers["x-omniroute-csrf"] !== session.csrf) throw new SafeError("CSRF_REJECTED", "Valid Origin and CSRF header are required", 403);
    }
  }

  private enforceRate(identity: string): void {
    const now = Date.now();
    const history = (this.#rate.get(identity) ?? []).filter((time) => now - time < 60_000);
    if (history.length >= this.#runtime.config.daemon.requestsPerMinute) throw new SafeError("RATE_LIMITED", "Local request rate limit exceeded", 429);
    history.push(now);
    this.#rate.set(identity, history);
  }

  private consumeOneTimeSession(nonce: string, response: ServerResponse): void {
    const pending = this.#oneTimeSessions.get(nonce);
    this.#oneTimeSessions.delete(nonce);
    if (!pending || pending.expiresAt < Date.now()) throw new SafeError("SESSION_LINK_INVALID", "Dashboard session link is invalid or expired", 401);
    const csrf = randomBytes(24).toString("base64url");
    this.#browserSessions.set(pending.sessionId, { csrf, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    response.writeHead(302, { location: "/", "set-cookie": `omniroute_session=${encodeURIComponent(pending.sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`, "cache-control": "no-store" });
    response.end();
  }

  private async body(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > this.#runtime.config.daemon.maxRequestBytes) throw new SafeError("REQUEST_TOO_LARGE", "Request body exceeds the configured limit", 413);
      chunks.push(buffer);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
    catch { throw new SafeError("JSON_INVALID", "Request body must be valid JSON", 400); }
  }

  private async handleTask(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const match = /^\/v1\/tasks\/([^/]+)(?:\/(plan|approve|pause|resume|cancel|diff|verify|report))?$/.exec(url.pathname);
    if (!match) throw new SafeError("NOT_FOUND", "Task endpoint not found", 404);
    let id: string;
    try { id = decodeURIComponent(match[1]!); } catch { throw new SafeError("TASK_ID_INVALID", "Task identifier is invalid", 400); }
    const operation = match[2] ?? "status";
    if (operation === "status" && request.method === "GET") { this.json(response, 200, await this.#tasks.status(id)); return; }
    if (operation === "plan" && request.method === "GET") { this.json(response, 200, await this.#tasks.inspectPlan(id)); return; }
    if (operation === "diff" && request.method === "GET") { this.json(response, 200, { artifacts: await this.#tasks.inspectDiff(id) }); return; }
    if (operation === "report" && request.method === "GET") { this.json(response, 200, await this.#tasks.report(id)); return; }
    if (request.method !== "POST") throw new SafeError("METHOD_NOT_ALLOWED", "Task operation requires its documented HTTP method", 405);
    const input = await this.body(request) as Record<string, unknown>;
    if (operation === "approve") {
      if (typeof input.approvalId !== "string") throw new SafeError("TASK_APPROVAL_REQUIRED", "An explicit approval identifier is required", 400);
      this.json(response, 200, await this.#tasks.approve(id, input.approvalId)); return;
    }
    if (operation === "pause") { this.json(response, 200, await this.#tasks.pause(id, typeof input.reason === "string" ? input.reason : undefined)); return; }
    if (operation === "resume") { this.json(response, 200, await this.#tasks.resume(id)); return; }
    if (operation === "cancel") { this.json(response, 200, await this.#tasks.cancel(id, typeof input.reason === "string" ? input.reason : undefined)); return; }
    if (operation === "verify") {
      if (typeof input.check !== "string" || !["passed", "failed", "skipped"].includes(input.status as string) || typeof input.summary !== "string") throw new SafeError("TASK_VERIFICATION_INVALID", "Verification requires check, status and summary", 400);
      this.json(response, 200, await this.#tasks.verify(id, { check: input.check, status: input.status as TaskVerification["status"], summary: input.summary, ...(typeof input.at === "string" ? { at: input.at } : {}) })); return;
    }
    throw new SafeError("NOT_FOUND", "Task operation not found", 404);
  }

  private async updateBudget(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const input = await this.body(request) as Record<string, unknown>;
    for (const key of ["dailyUsd", "monthlyUsd", "perRequestUsd"] as const) {
      if (!(key in input)) continue;
      const value = input[key];
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new SafeError("BUDGET_INVALID", `${key} must be non-negative or null`, 400);
      this.#runtime.config.budgets[key] = value as number | null;
    }
    await saveConfig(this.#runtime.config, this.#runtime.paths);
    this.json(response, 200, { budgets: this.#runtime.config.budgets, note: "Changes apply to new routes; restart is not required for budget values." });
  }

  private routeRequest(input: unknown, defaults: Partial<RouteRequest> = {}): RouteRequest {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new SafeError("REQUEST_INVALID", "Route request must be an object", 400);
    const raw = input as Record<string, unknown>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt : typeof defaults.prompt === "string" ? defaults.prompt : "";
    if (raw.selectionPin !== undefined && (!raw.selectionPin || typeof raw.selectionPin !== "object" || Array.isArray(raw.selectionPin))) throw new SafeError("PIN_INVALID", "Pin must be an object", 400);
    const requestedMode = typeof raw.routingMode === "string" ? raw.routingMode : defaults.routingMode ?? this.#runtime.config.routing.defaultMode;
    if (!ROUTING_MODES.includes(requestedMode as RoutingMode)) throw new SafeError("ROUTING_MODE_INVALID", "routingMode must be regular or orchestrator", 400);
    const capabilities = Array.isArray(raw.requestedCapabilities) ? raw.requestedCapabilities.filter((item): item is Capability => typeof item === "string" && CAPABILITIES.includes(item as Capability)) : defaults.requestedCapabilities ?? [];
    return {
      prompt,
      ...(raw.taskPacket !== undefined ? {taskPacket: raw.taskPacket as NonNullable<RouteRequest["taskPacket"]>} : {}),
      ...(raw.selectionPin !== undefined ? {selectionPin: raw.selectionPin as NonNullable<RouteRequest["selectionPin"]>} : {}),
      routingMode: requestedMode as RoutingMode,
      sourceClient: typeof raw.sourceClient === "string" ? raw.sourceClient : defaults.sourceClient ?? "local-api",
      hostApplication: typeof raw.hostApplication === "string" ? raw.hostApplication : defaults.hostApplication ?? "standalone",
      hostModel: typeof raw.hostModel === "string" ? raw.hostModel : defaults.hostModel ?? null,
      hostModelAuthoritative: raw.hostModelAuthoritative === true || defaults.hostModelAuthoritative === true,
      attachments: Array.isArray(raw.attachments) ? raw.attachments.filter((item): item is RouteRequest["attachments"][number] => Boolean(item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && typeof (item as { mediaType?: unknown }).mediaType === "string" && typeof (item as { size?: unknown }).size === "number")) : defaults.attachments ?? [],
      requestedCapabilities: capabilities,
      maxOutputTokens: typeof raw.maxOutputTokens === "number" ? raw.maxOutputTokens : defaults.maxOutputTokens ?? null,
      privacyMode: typeof raw.privacyMode === "boolean" ? raw.privacyMode : defaults.privacyMode ?? null,
      metadata: raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata as Record<string, string> : defaults.metadata ?? {},
    };
  }

  private async runRoute(routeRequest: RouteRequest, request: IncomingMessage, response: ServerResponse, onEvent?: (event: RouteEvent) => void | Promise<void>): Promise<Awaited<ReturnType<DaemonRuntime["router"]["route"]>>> {
    if (this.#activeRoutes >= this.#runtime.config.daemon.maxConcurrentRoutes) throw new SafeError("CONCURRENCY_LIMIT", "Maximum concurrent routes reached", 429);
    this.#activeRoutes += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new SafeError("ROUTE_TIMEOUT", "Route timed out", 504)), this.#runtime.config.daemon.routeTimeoutMs);
    const abortDisconnected = (): void => controller.abort(new DOMException("Client disconnected", "AbortError"));
    const abortClosedResponse = (): void => { if (!response.writableEnded) abortDisconnected(); };
    request.once("aborted", abortDisconnected);
    response.once("close", abortClosedResponse);
    try { return await this.#runtime.router.route(routeRequest, controller.signal, onEvent); }
    finally {
      clearTimeout(timeout);
      request.off("aborted", abortDisconnected);
      response.off("close", abortClosedResponse);
      this.#activeRoutes -= 1;
    }
  }

  private async beginAutomaticRouteTask(route: RouteRequest): Promise<AutomaticRouteTask> {
    const task = await this.#tasks.submit({
      objective: `Tracked ${route.sourceClient} route`,
      constraints: ["Route prompt content is intentionally not persisted in durable task state."],
      contextReferences: (route.taskPacket?.excerpts ?? []).map((excerpt) => ({ path: excerpt.path, digest: createHash("sha256").update(excerpt.text).digest("hex") })),
      requiredCapabilities: route.requestedCapabilities,
      approvedTools: [],
      budget: { maxAttempts: 1, maxOutputTokens: route.maxOutputTokens ?? this.#runtime.config.routing.maxOutputTokensPerRequest, maxLatencyMs: this.#runtime.config.daemon.routeTimeoutMs, maxCostUsd: null },
      stopConditions: ["route timeout", "client cancellation", "provider error"],
      acceptanceCriteria: ["Return an attributed route result with a recorded selected model."],
      idempotencyKey: null,
    });
    const planned = await this.#runtime.tasks.transition(task.id, "planning", { reason: "route accepted" });
    return { id: planned.id, state: planned.state };
  }

  private async observeAutomaticRouteTask(task: AutomaticRouteTask, event: RouteEvent): Promise<void> {
    if (event.type !== "route.planned" || task.state !== "planning") return;
    const started = await this.#runtime.tasks.transition(task.id, "executing", { route: event.plan.primary, reason: "route selected from live registry" });
    task.state = started.state;
  }

  private async completeAutomaticRouteTask(task: AutomaticRouteTask, result: Awaited<ReturnType<DaemonRuntime["router"]["route"]>>): Promise<void> {
    if (task.state === "planning") {
      const started = await this.#runtime.tasks.transition(task.id, "executing", { route: result.plan.primary, reason: "route completed before plan event was observed" });
      task.state = started.state;
    }
    if (task.state !== "executing") return;
    const verified = await this.#runtime.tasks.transition(task.id, "verifying", { route: result.attribution.worker, reason: `route ${result.routeId} produced an attributed result` });
    task.state = verified.state;
    await this.#runtime.tasks.recordVerification(task.id, { check: "route attribution", status: "passed", summary: `Route ${result.routeId} completed with ${result.attribution.worker.providerId}/${result.attribution.worker.modelId}`, at: new Date().toISOString() });
    const completed = await this.#runtime.tasks.transition(task.id, "completed", { reason: "route result verified" });
    task.state = completed.state;
  }

  private async failAutomaticRouteTask(task: AutomaticRouteTask, error: unknown): Promise<void> {
    if (task.state !== "planning" && task.state !== "executing" && task.state !== "verifying") return;
    const failed = await this.#runtime.tasks.transition(task.id, "failed", { reason: "route failed", error: safeError(error).message });
    task.state = failed.state;
  }

  private async handleNativeRoute(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const input = await this.body(request);
    const route = this.routeRequest(input);
    const streaming = request.headers.accept?.includes("text/event-stream") === true;
    if (streaming) response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    const task = await this.beginAutomaticRouteTask(route);
    try {
      const result = await this.runRoute(route, request, response, async (event) => {
        await this.observeAutomaticRouteTask(task, event);
        if (streaming) sse(response, event.type, event);
      });
      await this.completeAutomaticRouteTask(task, result);
      const attributed = { ...result, taskId: task.id };
      if (streaming) { sse(response, "result", attributed); response.end(); }
      else this.routeJson(response, attributed);
    } catch (error) {
      await this.failAutomaticRouteTask(task, error).catch(() => undefined);
      throw error;
    }
  }

  private async handleChatCompatibility(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const input = await this.body(request) as { messages?: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string }> }>; stream?: boolean; user?: string };
    const sessionId = this.requestSessionId(request);
    const incoming = this.sessionMessages(input.messages ?? []);
    const resolvedMessages = this.#runtime.config.privacy.sessionFilesEnabled && sessionId ? await this.resolveSessionMessages(sessionId, incoming) : incoming;
    const sessionMessages = this.#runtime.config.privacy.sessionFilesEnabled && sessionId
      ? compactSessionMessages(resolvedMessages, { maxTokens: this.#runtime.config.privacy.sessionMaxTokens, recentMessages: this.#runtime.config.privacy.sessionRecentMessages }).messages
      : resolvedMessages;
    const prompt = this.renderSessionMessages(sessionMessages);
    const route = this.routeRequest({ prompt, sourceClient: "openai-compatible", hostApplication: "compatible-api", metadata: input.user ? { user: createHash("sha256").update(input.user).digest("hex").slice(0, 16) } : {} });
    const streaming = input.stream === true;
    if (streaming) {
      let routeId = "pending";
      let activeWorker = "unknown";
      let started = false;
      const begin = (): void => {
        if (started) return;
        started = true;
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-omniroute-route-id": routeId, "x-omniroute-orchestrator": route.routingMode === "regular" ? "omniroute/deterministic-direct" : `${this.#runtime.config.routing.orchestratorProviderId}/${this.#runtime.config.routing.orchestratorModelId}`, "x-omniroute-worker": activeWorker });
      };
      const result = await this.runRoute(route, request, response, async (event) => {
        if (event.type === "route.started") routeId = event.routeId;
        if (event.type === "worker.started" && event.subtaskId === null) activeWorker = `${event.providerId}/${event.modelId}`;
        if (event.type === "worker.delta" && event.subtaskId === null) {
          begin();
          const id = `chatcmpl_${routeId}`;
          response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "omniroute", choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }] })}\n\n`);
        }
      });
      await this.persistSession(sessionId, sessionMessages, result.answer);
      begin();
      const id = `chatcmpl_${result.routeId}`;
      response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "omniroute", choices: [{ index: 0, delta: { content: `\n\n${result.badge}` }, finish_reason: null }], omni_attribution: result.attribution })}\n\n`);
      response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "omniroute", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      response.end("data: [DONE]\n\n");
    } else {
      const result = await this.runRoute(route, request, response);
      await this.persistSession(sessionId, sessionMessages, result.answer);
      this.attributionHeaders(response, result);
      this.json(response, 200, { id: `chatcmpl_${result.routeId}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: "omniroute", choices: [{ index: 0, message: { role: "assistant", content: `${result.answer}\n\n${result.badge}` }, finish_reason: "stop" }], usage: { prompt_tokens: result.attribution.usage.inputTokens, completion_tokens: result.attribution.usage.outputTokens, total_tokens: result.attribution.usage.inputTokens + result.attribution.usage.outputTokens }, omni_attribution: result.attribution });
    }
  }

  private sessionPathId(pathname: string): string {
    const encoded = pathname.slice("/v1/sessions/".length);
    let id: string;
    try { id = decodeURIComponent(encoded); } catch { throw new SafeError("SESSION_ID_INVALID", "Session identifier is invalid", 400); }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id === "." || id === "..") throw new SafeError("SESSION_ID_INVALID", "Session identifier is invalid", 400);
    return id;
  }

  private requestSessionId(request: IncomingMessage): string | null {
    const value = request.headers["x-omniroute-session"];
    const id = Array.isArray(value) ? value[0] : value;
    if (id === undefined) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id === "." || id === "..") throw new SafeError("SESSION_ID_INVALID", "X-OmniRoute-Session must be a safe local session identifier", 400);
    return id;
  }

  private sessionMessages(messages: Array<{ role?: string; content?: unknown }>): SessionMessage[] {
    return messages.flatMap((message) => {
      const role = message.role === "system" || message.role === "assistant" || message.role === "tool" ? message.role : "user";
      const content = typeof message.content === "string"
        ? message.content
        : (Array.isArray(message.content) ? message.content.map((part) => {
          if (!part || typeof part !== "object") return "";
          const value = part as { text?: unknown; content?: unknown };
          return typeof value.text === "string" ? value.text : typeof value.content === "string" ? value.content : "";
        }).join("\n") : "");
      return content.trim() ? [{ role, content, at: new Date().toISOString() }] : [];
    });
  }

  private async resolveSessionMessages(id: string, incoming: SessionMessage[]): Promise<SessionMessage[]> {
    const existing = await this.#sessions.load(id);
    if (!existing || incoming.length === 0) return existing?.messages ?? incoming;
    if (incoming.length > 1 || incoming.some((message) => message.role !== "user")) return incoming;
    const last = existing.messages.at(-1);
    if (last?.role === "user" && last.content === incoming[0]!.content) return existing.messages;
    return [...existing.messages, ...incoming];
  }

  private renderSessionMessages(messages: SessionMessage[]): string {
    return messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  }

  private async persistSession(id: string | null, messages: SessionMessage[], answer: string): Promise<void> {
    if (!id || !this.#runtime.config.privacy.sessionFilesEnabled) return;
    try {
      await this.#sessions.save(id, [...messages, { role: "assistant", content: answer, at: new Date().toISOString() }]);
    } catch (error) {
      // Session files are durability aids, not part of inference correctness.
      // A read-only disk or transient filesystem failure must not turn a
      // successful provider response into a user-visible 500/SSE failure.
      await this.#runtime.logger.write("warn", "session.persist_failed", { sessionId: id, error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    }
  }

  private async handleResponsesCompatibility(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const input = await this.body(request) as { input?: string | Array<{ role?: string; content?: unknown }>; stream?: boolean };
    const sessionId = this.requestSessionId(request);
    const incoming = typeof input.input === "string"
      ? this.sessionMessages([{ role: "user", content: input.input }])
      : this.sessionMessages((Array.isArray(input.input) ? input.input : []).map((message) => ({ ...(message.role === undefined ? {} : { role: message.role }), content: Array.isArray(message.content) ? message.content : typeof message.content === "string" ? message.content : [] })));
    const resolvedMessages = this.#runtime.config.privacy.sessionFilesEnabled && sessionId ? await this.resolveSessionMessages(sessionId, incoming) : incoming;
    const sessionMessages = this.#runtime.config.privacy.sessionFilesEnabled && sessionId
      ? compactSessionMessages(resolvedMessages, { maxTokens: this.#runtime.config.privacy.sessionMaxTokens, recentMessages: this.#runtime.config.privacy.sessionRecentMessages }).messages
      : resolvedMessages;
    const prompt = this.renderSessionMessages(sessionMessages);
    const route = this.routeRequest({ prompt, sourceClient: "responses-compatible", hostApplication: "compatible-api" });
    if (input.stream) {
      let routeId = "pending", activeWorker = "unknown", started = false;
      const begin = (): void => {
        if (started) return;
        started = true;
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-omniroute-route-id": routeId, "x-omniroute-orchestrator": route.routingMode === "regular" ? "omniroute/deterministic-direct" : `${this.#runtime.config.routing.orchestratorProviderId}/${this.#runtime.config.routing.orchestratorModelId}`, "x-omniroute-worker": activeWorker });
      };
      const result = await this.runRoute(route, request, response, async (event) => {
        if (event.type === "route.started") routeId = event.routeId;
        if (event.type === "worker.started" && event.subtaskId === null) activeWorker = `${event.providerId}/${event.modelId}`;
        if (event.type === "worker.delta" && event.subtaskId === null) { begin(); sse(response, "response.output_text.delta", { type: "response.output_text.delta", delta: event.text }); }
      });
      begin();
      await this.persistSession(sessionId, sessionMessages, result.answer);
      const payload = this.responsesPayload(result);
      sse(response, "response.output_text.delta", { type: "response.output_text.delta", delta: `\n\n${result.badge}` });
      response.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: payload })}\n\n`);
      response.end();
    } else {
      const result = await this.runRoute(route, request, response);
      await this.persistSession(sessionId, sessionMessages, result.answer);
      this.attributionHeaders(response, result);
      this.json(response, 200, this.responsesPayload(result));
    }
  }

  private responsesPayload(result: Awaited<ReturnType<DaemonRuntime["router"]["route"]>>): Record<string, unknown> {
    return { id: `resp_${result.routeId}`, object: "response", created_at: Math.floor(Date.now() / 1000), status: "completed", model: "omniroute", output: [{ id: `msg_${result.routeId}`, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: `${result.answer}\n\n${result.badge}`, annotations: [] }] }], output_text: `${result.answer}\n\n${result.badge}`, usage: { input_tokens: result.attribution.usage.inputTokens, output_tokens: result.attribution.usage.outputTokens, total_tokens: result.attribution.usage.inputTokens + result.attribution.usage.outputTokens }, metadata: { omniroute_route_id: result.routeId, omniroute_worker: `${result.attribution.worker.providerId}/${result.attribution.worker.modelId}` } };
  }

  private routeJson(response: ServerResponse, result: Awaited<ReturnType<DaemonRuntime["router"]["route"]>>): void {
    this.attributionHeaders(response, result);
    this.json(response, 200, result);
  }

  private attributionHeaders(response: ServerResponse, result: Awaited<ReturnType<DaemonRuntime["router"]["route"]>>): void {
    response.setHeader("x-omniroute-route-id", result.routeId);
    response.setHeader("x-omniroute-orchestrator", `${result.attribution.orchestrator.providerId}/${result.attribution.orchestrator.modelId}`);
    response.setHeader("x-omniroute-worker", `${result.attribution.worker.providerId}/${result.attribution.worker.modelId}`);
  }

  private async serveDashboard(pathname: string, response: ServerResponse): Promise<void> {
    const root = fileURLToPath(new URL("../../dashboard/dist/", import.meta.url));
    const clean = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    if (clean.includes("..") || clean.includes("\\")) throw new SafeError("NOT_FOUND", "Asset not found", 404);
    const path = join(root, clean);
    try {
      const metadata = await stat(path);
      if (!metadata.isFile()) throw new Error("not a file");
      response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream", "cache-control": clean === "index.html" ? "no-store" : "public, max-age=3600", "content-security-policy": "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
      createReadStream(path).on("error", () => response.destroy()).pipe(response);
    } catch { throw new SafeError("NOT_FOUND", "Asset not found", 404); }
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    const body = JSON.stringify(globalRedactor.redact(value));
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(body);
  }
}
