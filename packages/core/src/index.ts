import { createHash } from "node:crypto";
import type { OmniConfig } from "@omniroute/config";
import { FreeModelFailover, type ModelPreference } from "./free-failover.js";
import {
  attributionBadge,
  CAPABILITIES,
  newRouteId,
  ROUTING_PLAN_JSON_SCHEMA,
  validateRoutingPlan,
  type AttributionRecord,
  type Capability,
  type ModelEntry,
  type ModelSelection,
  type ReasoningEffort,
  type RegistrySnapshot,
  type RouteEvent,
  type RouteRequest,
  type RouteResult,
  type RouteSubtask,
  type RoutingPlan,
  type TaskClass,
  type TaskSignals,
  type Usage,
} from "@omniroute/contracts";
import { AuditStore, globalRedactor, JsonlLogger, SafeError } from "@omniroute/observability";
import {
  calculateUsageCost,
  emptyUsage,
  retryProviderCall,
  type GenerateRequest,
  type ProviderAdapter,
} from "@omniroute/providers";

const TASK_ORDER: TaskClass[] = ["micro", "small", "medium", "large", "critical"];

function uniqueCapabilities(values: Capability[]): Capability[] {
  return [...new Set(values)].filter((value) => CAPABILITIES.includes(value));
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const ascii = [...text].filter((character) => character.charCodeAt(0) <= 127).length;
  return Math.max(1, Math.ceil(ascii / 4 + (text.length - ascii) / 2));
}

export function classifyTask(request: RouteRequest): TaskSignals {
  // Only the isolated Antigravity worker path opts into these local Malay cues.
  // This is intent normalization, not translation of the worker's actual prompt.
  const boundedWorker = request.sourceClient === "antigravity-mcp" && request.metadata?.workerTextOnly === "true";
  const malay: Record<string, string> = { "seni bina": "architecture", "berbilang fail": "multi-file", "keseluruhan": "entire", "tulis": "write", "fungsi": "function", "kod": "code", "baiki": "fix", "bina": "build", "uji": "test", "ringkaskan": "summarize", "terjemah": "translate", "keselamatan": "security", "padam": "delete" };
  const prompt = boundedWorker ? request.prompt.replace(/\b(?:seni bina|berbilang fail|keseluruhan|tulis|fungsi|kod|baiki|bina|uji|ringkaskan|terjemah|keselamatan|padam)\b/gi, word => malay[word.toLowerCase()] ?? word) : request.prompt;
  const lower = prompt.toLowerCase();
  const attachmentBytes = request.attachments.reduce((total, item) => total + Math.max(0, item.size), 0);
  const attachmentText = request.attachments.map((item) => item.text ?? "").join("\n");
  const estimatedInputTokens = estimateTokens(prompt) + estimateTokens(attachmentText) + Math.ceil(attachmentBytes / 16_000);
  const listSignals = (prompt.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/g) ?? []).length;
  const requestedOutputs = Math.max(1, listSignals > 1 ? Math.min(8, listSignals) : /\b(?:both|three|several|multiple|each)\b/i.test(prompt) ? 2 : 1);
  const dependencyWords = (prompt.match(/\b(?:then|after|before|depends|followed by|once|subtask|phase)\b/gi) ?? []).length;
  const dependencyDepth = Math.min(8, dependencyWords);
  const explanatoryQuestion = /^\s*(?:what|why|how|when|where|who|can you explain|explain)\b/i.test(prompt);
  const requiresTools = /\b(?:browse|search|research|look up|run|execute|inspect|deploy)\b/i.test(prompt) || (!explanatoryQuestion && /\b(?:repository|monorepo|terminal|file system)\b/i.test(prompt)) || /\b(?:edit|modify|update|fix|refactor|migrate|implement)\b[\s\S]*\b(?:repository|monorepo|database|files?|api)\b/i.test(prompt);
  const explicitHighRisk = /\b(?:delete|destroy|drop database|rotate key|credential|secret|security|vulnerability|medical|diagnos|legal|financial advice|purchase|payment|publish)\b/i.test(prompt);
  const productionAction = /\bproduction\b/i.test(prompt) && /\b(?:deploy|migration|migrate|delete|credential|database|customer data|rotate)\b/i.test(prompt);
  const riskLevel = explicitHighRisk || productionAction ? "high" : /\b(?:migration|permission|authentication|encrypt|backup|rollback|personal data|pii)\b/i.test(prompt) ? "medium" : "low";
  const inferred: Capability[] = ["text"];
  if (request.attachments.some((item) => item.mediaType.startsWith("image/")) || /\b(?:image|screenshot|diagram|photo|vision)\b/i.test(prompt)) inferred.push("vision");
  if (/\b(?:code|coding|implement|repository|typescript|javascript|python|sql|rust|kotlin|bug|test|compile|refactor)\b/i.test(prompt) || /```/.test(prompt) || /\b(?:write|implement|debug|refactor|review|fix)\b[\s\S]*\b(?:function|class|component|script|query)\b/i.test(prompt)) inferred.push("coding");
  if (requiresTools && !boundedWorker) inferred.push("tool_calling");
  if (/\b(?:browse|web|internet|latest|current|research|source|citation)\b/i.test(prompt)) inferred.push("web");
  if (/\b(?:json|schema|structured|csv|table|xml)\b/i.test(prompt)) inferred.push("structured_output");
  if (estimatedInputTokens > 80_000 || attachmentBytes > 2_000_000) inferred.push("long_context");
  const requiredCapabilities = uniqueCapabilities([...request.requestedCapabilities, ...inferred]);
  const deterministicCandidate = /\b(?:format|extract|classify|rename|convert|sort|deduplicate)\b/i.test(prompt) && !requiresTools && riskLevel === "low" && estimatedInputTokens < 2_000;
  const scopeSignals = (prompt.match(/\b(?:architecture|broad|entire|production-quality|ambiguous|cross-service|long logs?|long collection|independent hypotheses?|comprehensive|end-to-end|multi-file|monorepo|roadmap|migrations?)\b/gi) ?? []).length;

  let score = 0;
  score += Math.min(25, Math.ceil(estimatedInputTokens / 2_000));
  score += Math.min(15, Math.ceil(attachmentBytes / 250_000));
  score += Math.min(12, (requestedOutputs - 1) * 3);
  score += Math.min(16, dependencyDepth * 3);
  score += requiresTools ? 10 : 0;
  score += riskLevel === "high" ? 25 : riskLevel === "medium" ? 10 : 0;
  score += Math.min(24, scopeSignals * 5);
  score = Math.min(100, score);

  let suggestedClass: TaskClass;
  if (riskLevel === "high" && /\b(?:destructive|delete|destroy|credential|secret|security|medical|legal|financial|customer data)\b/i.test(lower)) suggestedClass = "critical";
  else if (score >= 65 || estimatedInputTokens > 100_000 || (scopeSignals >= 3 && requiresTools) || (requiredCapabilities.includes("long_context") && scopeSignals >= 2)) suggestedClass = "large";
  else if (score >= 30 || dependencyDepth >= 2 || requestedOutputs >= 3 || attachmentBytes > 2_000_000 || (requiresTools && requestedOutputs >= 2) || (dependencyDepth >= 1 && (requiredCapabilities.includes("coding") || requiredCapabilities.includes("structured_output")))) suggestedClass = "medium";
  else if (deterministicCandidate && score < 12) suggestedClass = "micro";
  else suggestedClass = "small";

  const latencyPreference = /\b(?:fast|quick|low latency|urgent)\b/i.test(prompt) ? "fast" : /\b(?:best|quality|thorough|careful|deep)\b/i.test(prompt) ? "quality" : "balanced";
  const expectedVerificationEffort = suggestedClass === "critical" ? "high" : suggestedClass === "large" ? "medium" : riskLevel === "medium" ? "low" : "none";
  const codingAction = request.requestedCapabilities.includes("coding") || /```/.test(prompt) || (requiredCapabilities.includes("coding") && /\b(?:write|implement|debug|refactor|compile|build|develop|fix|migrate|review|audit|test|explain this code)\b/i.test(prompt));
  const demanding = !["micro", "small"].includes(suggestedClass) || estimatedInputTokens > 4000 || attachmentBytes > 500_000 || latencyPreference === "quality" || scopeSignals > 0 || requiresTools || requiredCapabilities.some(cap => ["web", "tool_calling", "long_context"].includes(cap)) || /\b(?:prove|proof|in-depth|rigorous|optimi[sz]e|algorithm)\b/i.test(prompt);
  const intent: TaskSignals["intent"] = riskLevel !== "low" ? "high_risk" : demanding ? "complex_task" : codingAction ? "coding" : deterministicCandidate || /\b(?:write|rewrite|summari[sz]e|translate|draft|rephrase)\b/i.test(prompt) ? "light_task" : "casual_question";
  return { intent, estimatedInputTokens, attachmentBytes, requestedOutputs, dependencyDepth, requiresTools, requiredCapabilities, riskLevel, latencyPreference, expectedVerificationEffort, deterministicCandidate, suggestedClass };
}

export interface RouterDependencies {
  config: OmniConfig;
  providers: Map<string, ProviderAdapter>;
  registry: () => Promise<RegistrySnapshot>;
  audit: AuditStore;
  logger: JsonlLogger;
}

export type RouteEventHandler = (event: RouteEvent) => void | Promise<void>;

interface ExecutionState {
  modelPreference: ModelPreference;
  orchestrator: AttributionRecord["orchestrator"];
  usage: Usage;
  worker: ModelSelection;
  reviewers: AttributionRecord["reviewers"];
  fallbackAttempts: AttributionRecord["fallbacksAttempted"];
  policyDecisions: string[];
  reservedBudgetUsd: number;
}

function addUsage(total: Usage, next: Usage): void {
  total.inputTokens += next.inputTokens;
  total.outputTokens += next.outputTokens;
  total.cachedInputTokens += next.cachedInputTokens;
  total.estimatedCostUsd = total.estimatedCostUsd === null || next.estimatedCostUsd === null ? null : total.estimatedCostUsd + next.estimatedCostUsd;
}

function modelFrom(snapshot: RegistrySnapshot, selection: Pick<ModelSelection, "providerId" | "modelId">): ModelEntry {
  const model = snapshot.models.find((item) => item.providerId === selection.providerId && item.modelId === selection.modelId);
  if (!model) throw new SafeError("MODEL_NOT_IN_REGISTRY", `Model ${selection.providerId}/${selection.modelId} is not in the validated registry`);
  return model;
}

function safetyIdentifier(request: RouteRequest): string {
  return createHash("sha256").update(`${request.sourceClient}\u0000${request.hostApplication}`).digest("hex").slice(0, 32);
}

export class OmniRouter {
  readonly #config: OmniConfig;
  readonly #providers: Map<string, ProviderAdapter>;
  readonly #registry: () => Promise<RegistrySnapshot>;
  readonly #audit: AuditStore;
  readonly #logger: JsonlLogger;
  readonly #freeFailover: FreeModelFailover;
  #reservedProjectedUsd = 0;
  #budgetQueue: Promise<void> = Promise.resolve();

  constructor(dependencies: RouterDependencies) {
    this.#config = dependencies.config;
    this.#providers = dependencies.providers;
    this.#registry = dependencies.registry;
    this.#audit = dependencies.audit;
    this.#logger = dependencies.logger;
    this.#freeFailover = new FreeModelFailover(dependencies.config, dependencies.providers);
  }

  async route(request: RouteRequest, signal: AbortSignal, onEvent: RouteEventHandler = () => undefined): Promise<RouteResult> {
    const startedAt = new Date();
    const routeId = newRouteId(startedAt.getTime());
    await onEvent({ type: "route.started", routeId, at: startedAt.toISOString() });
    this.validateRequest(request);
    const signals = classifyTask(request);
    const modelPreference: ModelPreference = this.#config.routing.freeOnly && this.#config.routing.intentRoutingEnabled && ["casual_question", "light_task"].includes(signals.intent) ? "lightweight" : "quality";
    const mode = request.routingMode ?? this.#config.routing.defaultMode;
    const registered = await this.#registry();
    const demandingWorker = mode === 'regular' && request.sourceClient === 'antigravity-mcp' && signals.requiredCapabilities.includes('coding') && ['complex_task','high_risk'].includes(signals.intent);
    // A conservative configured tier floor, not a claim of benchmark superiority.
    // Filter the immutable route snapshot so EVERY retry observes the same floor.
    const snapshot = demandingWorker ? {...registered,models:registered.models.filter(model=>(model.intelligenceTier??0)>=4)} : registered;
    const freePlanner = mode === "orchestrator" && this.#config.routing.freeOnly && this.#config.routing.freeModelFailoverEnabled ? this.#freeFailover.candidates({ providerId: this.#config.routing.orchestratorProviderId, modelId: this.#config.routing.orchestratorModelId, reasoningEffort: modelPreference === "lightweight" ? "none" : this.orchestratorEffort(signals), maxOutputTokens: 4000 }, snapshot, ["text", "structured_output"], 0, modelPreference)[0] : undefined;
    const orchestratorModel = mode === "orchestrator" ? snapshot.models.find((model) => model.providerId === (freePlanner?.providerId ?? this.#config.routing.orchestratorProviderId) && model.modelId === (freePlanner?.modelId ?? this.#config.routing.orchestratorModelId) && model.enabled && model.allowed && model.health.status === "healthy" && model.capabilities.structuredOutput === true) ?? null : null;
    if (mode === "orchestrator" && !orchestratorModel) throw new SafeError("ORCHESTRATION_UNAVAILABLE", `Configured orchestrator ${this.#config.routing.orchestratorProviderId}/${this.#config.routing.orchestratorModelId} is not enabled, healthy, allowed, free-policy compliant, and structured-output capable`, 503);
    const orchestrator = orchestratorModel ? this.#providers.get(orchestratorModel.providerId) ?? null : null;
    if (mode === "orchestrator" && !orchestrator) throw new SafeError("ORCHESTRATION_UNAVAILABLE", "The configured orchestrator provider is unavailable", 503);
    const orchestratorEffort = mode === "orchestrator" && modelPreference !== "lightweight" ? this.orchestratorEffort(signals) : "none";
    const initialWorker = mode === "regular" ? this.selectDirectWorker(snapshot, signals, request, modelPreference) : { providerId: orchestratorModel!.providerId, modelId: orchestratorModel!.modelId, reasoningEffort: orchestratorEffort, maxOutputTokens: 1 };
    const state: ExecutionState = { modelPreference, orchestrator: mode === "regular" ? { providerId: "omniroute", modelId: "deterministic-direct", reasoningEffort: "none" } : { providerId: orchestratorModel!.providerId, modelId: orchestratorModel!.modelId, reasoningEffort: orchestratorEffort }, usage: { ...emptyUsage(), estimatedCostUsd: 0 }, worker: initialWorker, reviewers: [], fallbackAttempts: [], reservedBudgetUsd: 0, policyDecisions: [
      `deterministic signals suggested ${signals.suggestedClass}`,
      `intent ${signals.intent}; ${modelPreference} model preference`,
      ...(demandingWorker ? ['coding quality floor: configured tier >=4; rankings provisional pending executable benchmarks'] : []),
      mode === "regular" ? "regular mode bypassed model orchestration" : `orchestrator effort ${orchestratorEffort}`,
      this.#config.routing.freeOnly ? "free-only provider policy enforced" : "configured provider policy enforced",
      request.privacyMode ?? this.#config.privacy.privacyMode ? "privacy envelope enabled" : "standard compact envelope",
    ] };
    try {
      let plan: RoutingPlan;
      if (mode === "regular") {
        plan = this.directPlan(initialWorker, signals);
        const directCost = this.estimatePlanCost(plan, snapshot, signals);
        if (directCost === null) throw new SafeError("DIRECT_COST_UNKNOWN", "Regular mode requires known pricing metadata");
        await this.updateBudgetReservation(state, directCost);
      } else {
        await this.updateBudgetReservation(state, this.estimateOrchestratorReservation(orchestratorModel!, signals));
        plan = await this.plan(orchestratorModel!, snapshot, request, signals, orchestratorEffort, signal, state);
        if (state.modelPreference === "lightweight" && (!["micro", "small"].includes(plan.taskClass) || plan.riskLevel !== "low" || !["direct", "delegated"].includes(plan.executionMode) || plan.review.required)) {
          state.modelPreference = "quality";
          state.policyDecisions.push("validated plan requires stronger execution; lightweight preference lifted");
        }
      }
      await onEvent({ type: "route.planned", routeId, plan, at: new Date().toISOString() });
      state.worker = plan.primary;
      const answer = await this.executePlan(routeId, plan, request, snapshot, signal, onEvent, state);
      const endedAt = new Date();
      const attribution: AttributionRecord = {
        routeId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        sourceClient: request.sourceClient,
        hostApplication: request.hostApplication,
        hostModel: request.hostModelAuthoritative ? request.hostModel : null,
        hostModelAuthoritative: request.hostModelAuthoritative,
        orchestrator: state.orchestrator,
        worker: state.worker,
        reviewers: state.reviewers,
        fallbacksAttempted: state.fallbackAttempts,
        taskClass: plan.taskClass,
        policyDecisions: state.policyDecisions,
        usage: state.usage,
        latencyMs: endedAt.getTime() - startedAt.getTime(),
        status: "completed",
        registrySnapshotId: snapshot.id,
      };
      await this.#audit.append(attribution);
      await this.#logger.write("info", "route.completed", { routeId, attribution });
      await onEvent({ type: "route.completed", routeId, attribution, at: endedAt.toISOString() });
      return { routeId, answer, badge: attributionBadge(attribution), attribution, plan };
    } catch (error) {
      const message = globalRedactor.redactText(error instanceof Error ? error.message : String(error));
      await this.#logger.write("error", "route.failed", { routeId, error: message, fallbacksAttempted: state.fallbackAttempts, policyDecisions: state.policyDecisions });
      await onEvent({ type: "route.failed", routeId, error: message, at: new Date().toISOString() });
      throw error;
    } finally {
      await this.updateBudgetReservation(state, 0, true);
    }
  }

  private validateRequest(request: RouteRequest): void {
    if (!request.prompt.trim()) throw new SafeError("REQUEST_EMPTY", "Prompt is required", 400);
    if (Buffer.byteLength(request.prompt, "utf8") > this.#config.daemon.maxRequestBytes) throw new SafeError("REQUEST_TOO_LARGE", "Prompt exceeds the configured request-size limit", 413);
    for (const capability of request.requestedCapabilities) if (!CAPABILITIES.includes(capability)) throw new SafeError("CAPABILITY_INVALID", `Unknown capability: ${capability}`, 400);
    if (request.routingMode !== undefined && request.routingMode !== "regular" && request.routingMode !== "orchestrator") throw new SafeError("ROUTING_MODE_INVALID", "Routing mode must be regular or orchestrator", 400);
    if (request.hostModel && !request.hostModelAuthoritative) request.hostModel = null;
  }

  private selectDirectWorker(snapshot: RegistrySnapshot, signals: TaskSignals, request: RouteRequest, preference: ModelPreference): ModelSelection {
    if (this.#config.routing.freeOnly && this.#config.routing.freeModelFailoverEnabled) {
      const selected = this.#freeFailover.candidates({ providerId: this.#config.routing.directProviderOrder[0] ?? "", modelId: "", reasoningEffort: preference === "lightweight" ? "none" : "low", maxOutputTokens: request.maxOutputTokens ?? (preference === "lightweight" ? Math.min(2048, this.#config.routing.maxOutputTokensPerRequest) : this.#config.routing.maxOutputTokensPerRequest) }, snapshot, signals.requiredCapabilities, signals.estimatedInputTokens, preference)[0];
      if (!selected) throw new SafeError("DIRECT_MODEL_UNAVAILABLE", "No eligible free worker meets capability/context requirements outside its cooldown", 503);
      return selected;
    }
    const supports = (model: ModelEntry, capability: Capability): boolean => ({
      text: model.capabilities.text,
      vision: model.capabilities.imageInput,
      tool_calling: model.capabilities.toolCalling,
      long_context: model.contextWindow === null ? false : model.contextWindow >= 100_000,
      coding: model.capabilities.coding,
      web: model.capabilities.web,
      structured_output: model.capabilities.structuredOutput,
    })[capability] === true;
    const providerRanks = new Map(this.#config.routing.directProviderOrder.map((providerId, index) => [providerId, index]));
    const candidates = snapshot.models.filter((model) => model.enabled && model.allowed && model.health.status === "healthy" && signals.requiredCapabilities.every((capability) => supports(model, capability)) && (!this.#config.routing.freeOnly || (model.pricing.inputPerMillionUsd === 0 && model.pricing.outputPerMillionUsd === 0)));
    candidates.sort((left, right) => (providerRanks.get(left.providerId) ?? 999) - (providerRanks.get(right.providerId) ?? 999) || (preference === "lightweight" ? (left.intelligenceTier ?? 999) - (right.intelligenceTier ?? 999) : (right.intelligenceTier ?? 0) - (left.intelligenceTier ?? 0)) || (left.latencyTier ?? 9) - (right.latencyTier ?? 9) || `${left.providerId}/${left.modelId}`.localeCompare(`${right.providerId}/${right.modelId}`));
    const selected = candidates[0];
    if (!selected) throw new SafeError("DIRECT_MODEL_UNAVAILABLE", "No healthy allowed free model satisfies the regular-mode capability requirements", 503);
    const maximum = Math.min(request.maxOutputTokens ?? (preference === "lightweight" ? 2048 : this.#config.routing.maxOutputTokensPerRequest), selected.maxOutputTokens ?? this.#config.routing.maxOutputTokensPerRequest, this.#config.routing.maxOutputTokensPerRequest);
    const effort: ReasoningEffort = preference === "lightweight" && selected.reasoningEfforts.includes("none") ? "none" : selected.reasoningEfforts.includes("low") ? "low" : selected.reasoningEfforts.includes("none") ? "none" : selected.reasoningEfforts[0] ?? "none";
    return { providerId: selected.providerId, modelId: selected.modelId, reasoningEffort: effort, maxOutputTokens: maximum };
  }

  private directPlan(primary: ModelSelection, signals: TaskSignals): RoutingPlan {
    return {
      schemaVersion: 1,
      taskClass: signals.suggestedClass,
      complexityScore: signals.suggestedClass === "micro" ? 5 : signals.suggestedClass === "small" ? 20 : signals.suggestedClass === "medium" ? 45 : signals.suggestedClass === "large" ? 75 : 95,
      riskLevel: signals.riskLevel,
      confidence: 1,
      requiredCapabilities: signals.requiredCapabilities,
      executionMode: "direct",
      primary,
      subtasks: [],
      review: { required: false, providerId: "", modelId: "", criteria: [] },
      fallbacks: [],
      shortRationale: "Regular mode used deterministic free-policy model selection without an LLM planner.",
    };
  }

  private orchestratorEffort(signals: TaskSignals): ReasoningEffort {
    const ambiguous = signals.suggestedClass === "large" || signals.suggestedClass === "critical" || signals.dependencyDepth >= 2 || signals.requiredCapabilities.length >= 4;
    return ambiguous ? this.#config.routing.ambiguousOrchestratorEffort : this.#config.routing.defaultOrchestratorEffort;
  }

  private async plan(
    orchestratorModel: ModelEntry,
    snapshot: RegistrySnapshot,
    request: RouteRequest,
    signals: TaskSignals,
    effort: ReasoningEffort,
    signal: AbortSignal,
    state: ExecutionState,
  ): Promise<RoutingPlan> {
    const eligible = snapshot.models.filter((model) => model.enabled && model.allowed && model.health.status === "healthy");
    const compactRequest = this.routingRequest(request, signals);
    const envelope = {
      request: compactRequest,
      signals,
      validatedRegistry: eligible.map((model) => ({
        providerId: model.providerId,
        modelId: model.modelId,
        capabilities: model.capabilities,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        reasoningEfforts: model.reasoningEfforts,
        intelligenceTier: model.intelligenceTier,
        latencyTier: model.latencyTier,
        pricing: model.pricing,
      })),
      policy: {
        maxSubtasks: this.#config.routing.maxSubtasks,
        maxParallelWorkers: this.#config.routing.maxParallelWorkers,
        maxOutputTokensPerRequest: this.#config.routing.maxOutputTokensPerRequest,
        perRequestBudgetUsd: this.#config.budgets.perRequestUsd,
        emergencyFallbackEnabled: this.#config.routing.emergencyFallbackEnabled,
      },
    };
    const response = await this.generateRouted(orchestratorModel, {
      modelId: orchestratorModel.modelId,
      prompt: JSON.stringify(envelope),
      instructions: ROUTER_INSTRUCTIONS,
      reasoningEffort: effort,
      maxOutputTokens: 4_000,
      jsonSchema: ROUTING_PLAN_JSON_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "omniroute_plan_v1",
      signal,
      safetyIdentifier: safetyIdentifier(request),
    }, snapshot, state, "orchestrator", ["text", "structured_output"]);
    state.orchestrator = { providerId: response.selection.providerId, modelId: response.selection.modelId, reasoningEffort: response.selection.reasoningEffort };
    addUsage(state.usage, response.usage);
    let parsed: unknown;
    try { parsed = JSON.parse(response.text) as unknown; }
    catch { parsed = null; }
    const policy = {
      maxSubtasks: this.#config.routing.maxSubtasks,
      maxParallelWorkers: this.#config.routing.maxParallelWorkers,
      maxOutputTokensPerRequest: this.#config.routing.maxOutputTokensPerRequest,
      perRequestBudgetUsd: this.#config.budgets.perRequestUsd,
      emergencyFallbackEnabled: this.#config.routing.emergencyFallbackEnabled,
      estimatedInputTokens: signals.estimatedInputTokens,
      expectedSubtaskOutputTokens: this.#config.routing.expectedSubtaskOutputTokens,
      requiredCapabilities: signals.requiredCapabilities,
    };
    let validation = validateRoutingPlan(parsed, snapshot, policy);
    if (!validation.ok && this.#config.routing.repairInvalidPlanOnce) {
      state.policyDecisions.push("invalid orchestrator plan received; one constrained repair attempted");
      await this.updateBudgetReservation(state, this.estimateOrchestratorReservation(orchestratorModel, signals, true));
      const repair = await this.generateRouted(modelFrom(snapshot, response.selection), {
        modelId: orchestratorModel.modelId,
        prompt: JSON.stringify({ invalidPlan: parsed, validationErrors: validation.errors, originalEnvelope: envelope }),
        instructions: `${ROUTER_INSTRUCTIONS}\nRepair only the listed validation failures. Return a complete replacement plan.`,
        reasoningEffort: effort,
        maxOutputTokens: 4_000,
        jsonSchema: ROUTING_PLAN_JSON_SCHEMA as unknown as Record<string, unknown>,
        schemaName: "omniroute_plan_v1_repair",
        signal,
        safetyIdentifier: safetyIdentifier(request),
      }, snapshot, state, "orchestrator repair", ["text", "structured_output"]);
      state.orchestrator = { providerId: repair.selection.providerId, modelId: repair.selection.modelId, reasoningEffort: repair.selection.reasoningEffort };
      addUsage(state.usage, repair.usage);
      try { parsed = JSON.parse(repair.text) as unknown; } catch { parsed = null; }
      validation = validateRoutingPlan(parsed, snapshot, policy);
    }
    if (!validation.ok) throw new SafeError("ROUTING_PLAN_INVALID", `The configured orchestrator returned an invalid routing plan: ${validation.errors.join("; ")}`, 502);
    const classCost = this.estimatePlanCost(validation.value, snapshot, signals);
    if (classCost === null) throw new SafeError("TASK_CLASS_BUDGET_UNKNOWN", "Cannot validate task-class or aggregate budgets because selected model pricing is unknown");
    const projectedRouteCost = classCost + (state.usage.estimatedCostUsd ?? 0);
    if (this.#config.budgets.perRequestUsd !== null && projectedRouteCost > this.#config.budgets.perRequestUsd) {
      throw new SafeError("PER_REQUEST_BUDGET_EXCEEDED", `Projected route cost $${projectedRouteCost.toFixed(6)} including orchestration exceeds the per-request limit`, 429);
    }
    await this.updateBudgetReservation(state, projectedRouteCost);
    const allowedClassBudget = this.#config.budgets.taskClassMaximum[validation.value.taskClass];
    if (allowedClassBudget !== null && allowedClassBudget !== undefined) {
      if (classCost > allowedClassBudget) throw new SafeError("TASK_CLASS_BUDGET_EXCEEDED", `Estimated plan cost $${classCost.toFixed(6)} exceeds the ${validation.value.taskClass} task-class limit of $${allowedClassBudget.toFixed(2)}`, 429);
      state.policyDecisions.push(`task-class budget ceiling $${allowedClassBudget.toFixed(2)} validated`);
    }
    return validation.value;
  }

  private estimatePlanCost(plan: RoutingPlan, snapshot: RegistrySnapshot, signals: TaskSignals): number | null {
    const estimate = (providerId: string, modelId: string, inputTokens: number, outputTokens: number): number | null => {
      const model = snapshot.models.find((item) => item.providerId === providerId && item.modelId === modelId);
      const inputPrice = model?.pricing.inputPerMillionUsd;
      const outputPrice = model?.pricing.outputPerMillionUsd;
      if (inputPrice === null || inputPrice === undefined || outputPrice === null || outputPrice === undefined) return null;
      return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;
    };
    const subtaskOutput = Math.min(plan.primary.maxOutputTokens, this.#config.routing.expectedSubtaskOutputTokens);
    const primaryInput = signals.estimatedInputTokens + plan.subtasks.length * subtaskOutput;
    const costs: Array<number | null> = [estimate(plan.primary.providerId, plan.primary.modelId, primaryInput, plan.primary.maxOutputTokens)];
    for (const fallback of plan.fallbacks) costs.push(estimate(fallback.providerId, fallback.modelId, primaryInput, fallback.maxOutputTokens));
    for (const subtask of plan.subtasks) costs.push(estimate(subtask.providerId, subtask.modelId, signals.estimatedInputTokens + subtask.dependencies.length * subtaskOutput, subtaskOutput));
    if (plan.review.required) {
      const reviewOutput = this.#config.routing.expectedSubtaskOutputTokens;
      costs.push(estimate(plan.review.providerId, plan.review.modelId, signals.estimatedInputTokens + plan.primary.maxOutputTokens, reviewOutput));
      costs.push(estimate(plan.primary.providerId, plan.primary.modelId, signals.estimatedInputTokens + plan.primary.maxOutputTokens + reviewOutput, plan.primary.maxOutputTokens));
    }
    if (costs.some((cost) => cost === null)) return null;
    return (costs as number[]).reduce((total, cost) => total + cost, 0);
  }

  private estimateOrchestratorReservation(model: ModelEntry, signals: TaskSignals, includeRepair = false): number {
    const input = model.pricing.inputPerMillionUsd, output = model.pricing.outputPerMillionUsd;
    if (input === null || output === null) throw new SafeError("ORCHESTRATION_PRICE_UNKNOWN", "Cannot reserve budget because configured orchestrator pricing is unknown");
    const maximumBillableCalls = this.#config.reliability.retryLimit + 1 + (includeRepair ? 1 : 0);
    return maximumBillableCalls * (Math.max(2_000, signals.estimatedInputTokens) * input + 4_000 * output) / 1_000_000;
  }

  private async updateBudgetReservation(state: ExecutionState, target: number, releaseOnly = false): Promise<void> {
    const previous = this.#budgetQueue;
    let release!: () => void;
    this.#budgetQueue = new Promise<void>((resolvePromise) => { release = resolvePromise; });
    await previous;
    try {
      const otherReservations = Math.max(0, this.#reservedProjectedUsd - state.reservedBudgetUsd);
      if (!releaseOnly && target > 0) {
        if (this.#config.budgets.perRequestUsd !== null && target > this.#config.budgets.perRequestUsd) throw new SafeError("PER_REQUEST_BUDGET_EXCEEDED", "Maximum projected route cost would exceed the per-request OmniRoute budget", 429);
        const now = new Date();
        const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const [daily, monthly] = await Promise.all([this.#audit.spendingSince(startOfDay), this.#audit.spendingSince(startOfMonth)]);
        if (this.#config.budgets.dailyUsd !== null && daily + otherReservations + target > this.#config.budgets.dailyUsd) throw new SafeError("DAILY_BUDGET_EXCEEDED", "Projected and in-flight route cost would exceed the daily OmniRoute budget", 429);
        if (this.#config.budgets.monthlyUsd !== null && monthly + otherReservations + target > this.#config.budgets.monthlyUsd) throw new SafeError("MONTHLY_BUDGET_EXCEEDED", "Projected and in-flight route cost would exceed the monthly OmniRoute budget", 429);
      }
      this.#reservedProjectedUsd = otherReservations + target;
      state.reservedBudgetUsd = target;
    } finally { release(); }
  }

  private routingRequest(request: RouteRequest, signals: TaskSignals): Record<string, unknown> {
    const privacy = request.privacyMode ?? this.#config.privacy.privacyMode;
    if (!privacy) return { prompt: request.prompt.slice(0, 80_000), attachments: request.attachments.map((item) => ({ name: item.name, mediaType: item.mediaType, size: item.size })), requestedCapabilities: request.requestedCapabilities };
    return {
      promptSummary: request.prompt.slice(0, 2_000),
      promptHash: createHash("sha256").update(request.prompt).digest("hex"),
      promptCharacters: request.prompt.length,
      attachmentMetadata: request.attachments.map((item) => ({ mediaType: item.mediaType, size: item.size })),
      requestedCapabilities: signals.requiredCapabilities,
    };
  }

  private async executePlan(
    routeId: string,
    plan: RoutingPlan,
    request: RouteRequest,
    snapshot: RegistrySnapshot,
    signal: AbortSignal,
    onEvent: RouteEventHandler,
    state: ExecutionState,
  ): Promise<string> {
    const subtaskOutputs = plan.subtasks.length > 0 ? await this.executeSubtasks(routeId, plan.subtasks, plan, request, snapshot, signal, onEvent, state) : new Map<string, string>();
    const workerPrompt = plan.subtasks.length > 0
      ? `${request.prompt}\n\nValidated subtask results:\n${[...subtaskOutputs].map(([id, output]) => `## ${id}\n${output}`).join("\n\n")}\n\nSynthesize the requested final deliverable. Preserve uncertainty and do not invent missing evidence.`
      : request.prompt;
    let answer = await this.executePrimaryWithFallbacks(routeId, plan, workerPrompt, snapshot, signal, onEvent, state, plan.review.required ? "draft" : null);
    if (plan.review.required) {
      const reviewerModel = snapshot.models.find((model) => model.providerId === plan.review.providerId && model.modelId === plan.review.modelId);
      if (!reviewerModel) throw new SafeError("REVIEW_MODEL_MISSING", "Validated review model disappeared from the snapshot");
      const reviewEffort = reviewerModel.reasoningEfforts.includes("medium") ? "medium" : reviewerModel.reasoningEfforts[0] ?? "none";
      const reviewer = this.#providers.get(plan.review.providerId);
      if (!reviewer) throw new SafeError("REVIEW_PROVIDER_MISSING", `Review provider ${plan.review.providerId} is unavailable`);
      const reviewResult = await this.generateRouted(reviewerModel, {
        modelId: plan.review.modelId,
        prompt: `Review this answer against the criteria. Identify only material errors, missing requirements, unsupported claims, or safety issues.\n\nCriteria:\n${plan.review.criteria.map((item) => `- ${item}`).join("\n")}\n\nOriginal request:\n${request.prompt}\n\nCandidate answer:\n${answer}`,
        instructions: "You are an independent verifier. Be concise, specific, and evidence-oriented.",
        reasoningEffort: reviewEffort,
        maxOutputTokens: Math.min(4_000, reviewerModel.maxOutputTokens ?? 4_000),
        jsonSchema: null,
        schemaName: null,
        signal,
        safetyIdentifier: safetyIdentifier(request),
      }, snapshot, state, "reviewer", plan.requiredCapabilities);
      addUsage(state.usage, reviewResult.usage);
      state.reviewers.push({ providerId: reviewResult.selection.providerId, modelId: reviewResult.selection.modelId, reasoningEffort: reviewResult.selection.reasoningEffort });
      await onEvent({ type: "review.completed", routeId, providerId: reviewResult.selection.providerId, modelId: reviewResult.selection.modelId, at: new Date().toISOString() });
      const revisionSelection = this.#freeFailover.enabled(plan.primary, snapshot) ? state.worker : plan.primary;
      answer = await this.executeSelection(routeId, revisionSelection, `${request.prompt}\n\nRevise the candidate answer only where the independent review identifies a material problem. Return the complete final answer.\n\nCandidate:\n${answer}\n\nReview:\n${reviewResult.text}`, snapshot, signal, onEvent, state, "revision", plan.requiredCapabilities);
    }
    return answer;
  }

  private async executeSubtasks(
    routeId: string,
    subtasks: RouteSubtask[],
    plan: RoutingPlan,
    request: RouteRequest,
    snapshot: RegistrySnapshot,
    signal: AbortSignal,
    onEvent: RouteEventHandler,
    state: ExecutionState,
  ): Promise<Map<string, string>> {
    const outputs = new Map<string, string>();
    const pending = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
    while (pending.size > 0) {
      if (signal.aborted) throw signal.reason;
      const ready = [...pending.values()].filter((subtask) => subtask.dependencies.every((dependency) => outputs.has(dependency)));
      if (ready.length === 0) throw new SafeError("DECOMPOSITION_DEADLOCK", "No dependency-ready subtask remains");
      for (let offset = 0; offset < ready.length; offset += this.#config.routing.maxParallelWorkers) {
        const wave = ready.slice(offset, offset + this.#config.routing.maxParallelWorkers);
        const completed = await Promise.all(wave.map(async (subtask) => {
          const selection: ModelSelection = {
            providerId: subtask.providerId,
            modelId: subtask.modelId,
            reasoningEffort: subtask.reasoningEffort,
            maxOutputTokens: Math.min(plan.primary.maxOutputTokens, this.#config.routing.expectedSubtaskOutputTokens),
          };
          const context = subtask.dependencies.map((id) => `Dependency ${id}:\n${outputs.get(id)}`).join("\n\n");
          const prompt = `Overall request:\n${request.prompt}\n\nYour bounded subtask:\n${subtask.goal}${context ? `\n\nValidated dependency outputs:\n${context}` : ""}\n\nReturn only the subtask result; do not claim to complete the overall request.`;
          const output = await this.executeSelection(routeId, selection, prompt, snapshot, signal, onEvent, state, subtask.id, plan.requiredCapabilities);
          return [subtask.id, output] as const;
        }));
        for (const [id, output] of completed) { outputs.set(id, output); pending.delete(id); }
      }
    }
    return outputs;
  }

  private async executePrimaryWithFallbacks(
    routeId: string,
    plan: RoutingPlan,
    prompt: string,
    snapshot: RegistrySnapshot,
    signal: AbortSignal,
    onEvent: RouteEventHandler,
    state: ExecutionState,
    label: string | null,
  ): Promise<string> {
    if (this.#freeFailover.enabled(plan.primary, snapshot)) return this.executeSelection(routeId, plan.primary, prompt, snapshot, signal, onEvent, state, label, plan.requiredCapabilities);
    const selections = [plan.primary, ...plan.fallbacks];
    let lastError: unknown;
    for (let index = 0; index < selections.length; index += 1) {
      const selection = selections[index]!;
      if (index > 0 && !this.#config.routing.emergencyFallbackEnabled) break;
      try {
        const answer = await this.executeSelection(routeId, selection, prompt, snapshot, signal, onEvent, state, label, plan.requiredCapabilities);
        if (index > 0) {
          state.fallbackAttempts.push({ providerId: selection.providerId, modelId: selection.modelId, outcome: "completed" });
          state.policyDecisions.push(`explicit emergency fallback used: ${selection.providerId}/${selection.modelId}`);
          state.worker = selection;
        }
        return answer;
      } catch (error) {
        lastError = error;
        if (signal.aborted || (error instanceof SafeError && error.code === "STREAM_PARTIAL")) throw error;
        if (index === 0 && plan.fallbacks.length > 0) state.fallbackAttempts.push({ providerId: selection.providerId, modelId: selection.modelId, outcome: globalRedactor.redactText((error as Error).message) });
      }
    }
    throw lastError;
  }

  private async executeSelection(
    routeId: string, selection: ModelSelection, prompt: string, snapshot: RegistrySnapshot,
    signal: AbortSignal, onEvent: RouteEventHandler, state: ExecutionState, subtaskId: string | null,
    required: Capability[],
  ): Promise<string> {
    const result = await this.#freeFailover.run(selection, snapshot, required, estimateTokens(prompt), signal, state, subtaskId ?? "worker", (candidate, automatic) => this.executeSelectionOnce(routeId, candidate, prompt, snapshot, signal, onEvent, state, subtaskId, automatic), state.modelPreference);
    if (subtaskId === null || subtaskId === "draft" || subtaskId === "revision") state.worker = result.selection;
    return result.value;
  }

  private async executeSelectionOnce(
    routeId: string,
    selection: ModelSelection,
    prompt: string,
    snapshot: RegistrySnapshot,
    signal: AbortSignal,
    onEvent: RouteEventHandler,
    state: ExecutionState,
    subtaskId: string | null,
    automatic = false,
  ): Promise<string> {
    const model = modelFrom(snapshot, selection);
    const settings = this.#config.providers.find(item=>item.id===selection.providerId);
    if(!settings?.enabled || !model.enabled || !model.allowed || (this.#config.routing.freeOnly && (!settings.freeTierOnly || model.pricing.inputPerMillionUsd !== 0 || model.pricing.outputPerMillionUsd !== 0))) throw new SafeError('WORKER_POLICY_REJECTED','Final dispatch rejected a disabled, paid or unknown-price worker');
    this.assertContextLimit(model, prompt, selection.maxOutputTokens);
    const provider = this.#providers.get(selection.providerId);
    if (!provider) throw new SafeError("WORKER_PROVIDER_UNAVAILABLE", `Worker provider ${selection.providerId} is unavailable`);
    await onEvent({ type: "worker.started", routeId, subtaskId, providerId: selection.providerId, modelId: selection.modelId, at: new Date().toISOString() });
    const request: GenerateRequest = {
      modelId: selection.modelId,
      prompt,
      instructions: "Produce the requested work directly. Do not claim to be the orchestrator. Preserve uncertainty, follow the user's scope, and do not expose secrets.",
      reasoningEffort: selection.reasoningEffort,
      maxOutputTokens: selection.maxOutputTokens,
      jsonSchema: null,
      schemaName: null,
      signal,
      safetyIdentifier: null,
    };
    let attempt = 0;
    while (true) {
      let text = "";
      let usage = emptyUsage();
      let responseId: string | null = null;
      try {
        if (provider.supportsStreaming) {
          for await (const event of provider.stream(request)) {
            if (event.type === "start" && event.responseId) responseId = event.responseId;
            if (event.type === "delta") { text += event.text; await onEvent({ type: "worker.delta", routeId, subtaskId, text: event.text, at: new Date().toISOString() }); }
            if (event.type === "usage") usage = event.usage;
          }
        } else {
          const result = await provider.generate(request);
          text = result.text;
          usage = result.usage;
          await onEvent({ type: "worker.delta", routeId, subtaskId, text, at: new Date().toISOString() });
        }
        addUsage(state.usage, calculateUsageCost(usage, model));
        await onEvent({ type: "worker.completed", routeId, subtaskId, at: new Date().toISOString() });
        return text;
      } catch (error) {
        if (signal.aborted && responseId) {
          try { await provider.cancel(responseId); state.policyDecisions.push(`cancel propagated to ${selection.providerId}/${selection.modelId}`); }
          catch { state.policyDecisions.push(`best-effort cancel failed for ${selection.providerId}/${selection.modelId}`); }
        }
        const classified = provider.classifyError(error);
        if (text.length > 0) throw new SafeError("STREAM_PARTIAL", `Worker stream failed after partial output; retry was not attempted because it could duplicate cost. ${classified.message}`);
        if (automatic && classified.category === "rate_limit") throw error;
        if (!classified.retryable || attempt >= this.#config.reliability.retryLimit || signal.aborted) throw error;
        attempt += 1;
        const delay = classified.retryAfterMs ?? Math.min(this.#config.reliability.retryMaxDelayMs, this.#config.reliability.retryBaseDelayMs * 2 ** (attempt - 1));
        await new Promise<void>((resolvePromise, reject) => {
          const timer = setTimeout(resolvePromise, delay);
          signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
        });
      }
    }
  }

  private async generateRouted(model: ModelEntry, request: GenerateRequest, snapshot: RegistrySnapshot, state: ExecutionState, label: string, required: Capability[]): Promise<{ text: string; usage: Usage; selection: ModelSelection }> {
    const initial = { providerId: model.providerId, modelId: model.modelId, reasoningEffort: request.reasoningEffort, maxOutputTokens: request.maxOutputTokens };
    const result = await this.#freeFailover.run(initial, snapshot, required, estimateTokens(request.prompt), request.signal, state, label, (candidate, automatic) => this.generateNonStreaming(this.#providers.get(candidate.providerId)!, modelFrom(snapshot, candidate), { ...request, modelId: candidate.modelId, reasoningEffort: candidate.reasoningEffort, maxOutputTokens: candidate.maxOutputTokens }, automatic), state.modelPreference);
    return { ...result.value, selection: result.selection };
  }

  private async generateNonStreaming(provider: ProviderAdapter, model: ModelEntry, request: GenerateRequest, automatic = false): Promise<{ text: string; usage: Usage }> {
    this.assertContextLimit(model, request.prompt, request.maxOutputTokens);
    const result = await retryProviderCall(provider, () => provider.generate(request), { retries: this.#config.reliability.retryLimit, baseDelayMs: this.#config.reliability.retryBaseDelayMs, maxDelayMs: this.#config.reliability.retryMaxDelayMs, signal: request.signal, skipRateLimitRetries: automatic });
    return { text: result.text, usage: calculateUsageCost(result.usage, model) };
  }

  private assertContextLimit(model: ModelEntry, prompt: string, maxOutputTokens: number): void {
    if (model.contextWindow === null) throw new SafeError("CONTEXT_LIMIT_UNKNOWN", `Context limit is unknown for ${model.providerId}/${model.modelId}`);
    const estimated = estimateTokens(prompt);
    if (estimated + maxOutputTokens > model.contextWindow) throw new SafeError("CONTEXT_LIMIT_EXCEEDED", `Estimated input and output exceed ${model.providerId}/${model.modelId} context limit`, 400);
  }
}

const ROUTER_INSTRUCTIONS = `You are OmniRoute's routing planner, not the final-answer model.
Return exactly one schema-valid routing plan. You may select only providerId/modelId pairs present in validatedRegistry.
Never invent capabilities, prices, limits, providers, models, or fallbacks. Unknown means unavailable for a requirement.
Use the deterministic signals as evidence, but correct the suggested class when the full request justifies it.
Micro: deterministic extraction/formatting/classification/tiny edits. Small: one focused deliverable. Medium: several dependent steps, files, analysis, or tools. Large: broad repository/research/architecture/long context. Critical: high stakes, destructive/security risk, or independent verification.
Prompt length alone never determines task class. Consider attachments, outputs, dependency depth, tools, risk, latency, budget, and verification.
Prefer efficient models for micro/small and stronger verified models for medium/large/critical while honoring the free-only policy and validated registry.
Keep normal orchestration economical. Use direct/delegated for focused work, decomposed only for real dependency structure, and parallel_review only when independent verification materially improves reliability.
All dependency IDs must exist, the graph must be acyclic, and fan-out must stay within policy. Return no prose outside JSON.`;

export function compareTaskClass(actual: TaskClass, acceptable: TaskClass[]): boolean {
  const index = TASK_ORDER.indexOf(actual);
  return acceptable.some((candidate) => Math.abs(TASK_ORDER.indexOf(candidate) - index) <= 0);
}
