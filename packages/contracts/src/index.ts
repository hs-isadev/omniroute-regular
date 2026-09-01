import { randomBytes } from "node:crypto";

export const ORCHESTRATOR_MODEL_ID = "gpt-5.6-sol" as const;
export const SCHEMA_VERSION = 1 as const;

export const CAPABILITIES = [
  "text",
  "vision",
  "tool_calling",
  "long_context",
  "coding",
  "web",
  "structured_output",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export const TASK_CLASSES = ["micro", "small", "medium", "large", "critical"] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const EXECUTION_MODES = ["direct", "delegated", "decomposed", "parallel_review"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export const ROUTING_MODES = ["regular", "orchestrator"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];

export type HealthStatus = "healthy" | "unhealthy" | "unknown";
export interface ModelHealth {
  status: HealthStatus;
  checkedAt: string | null;
  latencyMs: number | null;
  message: string | null;
}

export interface ModelCapabilities {
  text: boolean | null;
  imageInput: boolean | null;
  imageOutput: boolean | null;
  audioInput: boolean | null;
  audioOutput: boolean | null;
  toolCalling: boolean | null;
  structuredOutput: boolean | null;
  web: boolean | null;
  coding: boolean | null;
}

export interface ModelPricing {
  inputPerMillionUsd: number | null;
  outputPerMillionUsd: number | null;
  cachedInputPerMillionUsd: number | null;
  updatedAt: string | null;
}

export interface ModelEntry {
  providerId: string;
  modelId: string;
  name: string;
  enabled: boolean;
  health: ModelHealth;
  capabilities: ModelCapabilities;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  reasoningEfforts: ReasoningEffort[];
  intelligenceTier: 1 | 2 | 3 | 4 | 5 | null;
  latencyTier: 1 | 2 | 3 | 4 | 5 | null;
  pricing: ModelPricing;
  dataRegion: string | null;
  privacyLabels: string[];
  rateLimitState: "ok" | "limited" | "unknown";
  allowed: boolean;
  discoveredAt: string;
  source: "discovered" | "documented" | "override" | "merged";
}

export interface RegistrySnapshot {
  id: string;
  createdAt: string;
  models: ModelEntry[];
}

export interface ModelSelection {
  providerId: string;
  modelId: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
}

export interface RouteSubtask {
  id: string;
  goal: string;
  dependencies: string[];
  providerId: string;
  modelId: string;
  reasoningEffort: ReasoningEffort;
}

export interface ReviewPlan {
  required: boolean;
  providerId: string;
  modelId: string;
  criteria: string[];
}

export interface RoutingPlan {
  schemaVersion: 1;
  taskClass: TaskClass;
  complexityScore: number;
  riskLevel: RiskLevel;
  confidence: number;
  requiredCapabilities: Capability[];
  executionMode: ExecutionMode;
  primary: ModelSelection;
  subtasks: RouteSubtask[];
  review: ReviewPlan;
  fallbacks: ModelSelection[];
  shortRationale: string;
}

export interface TaskSignals {
  intent: "casual_question" | "light_task" | "coding" | "complex_task" | "high_risk";
  estimatedInputTokens: number;
  attachmentBytes: number;
  requestedOutputs: number;
  dependencyDepth: number;
  requiresTools: boolean;
  requiredCapabilities: Capability[];
  riskLevel: RiskLevel;
  latencyPreference: "fast" | "balanced" | "quality";
  expectedVerificationEffort: "none" | "low" | "medium" | "high";
  deterministicCandidate: boolean;
  suggestedClass: TaskClass;
}

export interface RouteRequest {
  prompt: string;
  routingMode?: RoutingMode;
  sourceClient: string;
  hostApplication: string;
  hostModel: string | null;
  hostModelAuthoritative: boolean;
  attachments: Array<{ name: string; mediaType: string; size: number; text?: string }>;
  requestedCapabilities: Capability[];
  maxOutputTokens: number | null;
  privacyMode: boolean | null;
  metadata: Record<string, string>;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number | null;
  measurement?: "provider-reported" | "estimated" | "unavailable" | "mixed";
}

export interface TokenSavingsSummary {
  routes: number;
  providerReportedRoutes: number;
  routesWithoutProviderUsage: number;
  providerReportedInputTokens: number;
  providerReportedOutputTokens: number;
  providerReportedTokensOffloaded: number;
  actualHostTokensSaved: null;
  savingsStatus: "counterfactual-host-usage-unavailable";
  explanation: string;
}

export interface ProviderErrorShape {
  category: "authentication" | "rate_limit" | "timeout" | "transient" | "invalid_request" | "unavailable" | "cancelled" | "unknown";
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
  providerStatus: number | null;
}

export interface AttributionRecord {
  routeId: string;
  startedAt: string;
  endedAt: string;
  sourceClient: string;
  hostApplication: string;
  hostModel: string | null;
  hostModelAuthoritative: boolean;
  orchestrator: { providerId: string; modelId: string; reasoningEffort: ReasoningEffort };
  worker: ModelSelection;
  reviewers: Array<{ providerId: string; modelId: string; reasoningEffort: ReasoningEffort }>;
  fallbacksAttempted: Array<{ providerId: string; modelId: string; outcome: string }>;
  taskClass: TaskClass;
  policyDecisions: string[];
  usage: Usage;
  latencyMs: number;
  status: "completed" | "failed" | "cancelled" | "partial";
  registrySnapshotId: string;
}

export type RouteEvent =
  | { type: "route.started"; routeId: string; at: string }
  | { type: "route.planned"; routeId: string; plan: RoutingPlan; at: string }
  | { type: "worker.started"; routeId: string; subtaskId: string | null; providerId: string; modelId: string; at: string }
  | { type: "worker.delta"; routeId: string; subtaskId: string | null; text: string; at: string }
  | { type: "worker.completed"; routeId: string; subtaskId: string | null; at: string }
  | { type: "review.completed"; routeId: string; providerId: string; modelId: string; at: string }
  | { type: "route.completed"; routeId: string; attribution: AttributionRecord; at: string }
  | { type: "route.failed"; routeId: string; error: string; at: string };

export interface RouteResult {
  routeId: string;
  answer: string;
  badge: string;
  attribution: AttributionRecord;
  plan: RoutingPlan;
}

export const ROUTING_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "taskClass", "complexityScore", "riskLevel", "confidence",
    "requiredCapabilities", "executionMode", "primary", "subtasks", "review",
    "fallbacks", "shortRationale",
  ],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    taskClass: { type: "string", enum: TASK_CLASSES },
    complexityScore: { type: "integer", minimum: 0, maximum: 100 },
    riskLevel: { type: "string", enum: RISK_LEVELS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    requiredCapabilities: { type: "array", uniqueItems: true, items: { type: "string", enum: CAPABILITIES } },
    executionMode: { type: "string", enum: EXECUTION_MODES },
    primary: { $ref: "#/$defs/selection" },
    subtasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "goal", "dependencies", "providerId", "modelId", "reasoningEffort"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" },
          goal: { type: "string", minLength: 1, maxLength: 2000 },
          dependencies: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 64 } },
          providerId: { type: "string", minLength: 1, maxLength: 128 },
          modelId: { type: "string", minLength: 1, maxLength: 256 },
          reasoningEffort: { type: "string", enum: REASONING_EFFORTS },
        },
      },
    },
    review: {
      type: "object",
      additionalProperties: false,
      required: ["required", "providerId", "modelId", "criteria"],
      properties: {
        required: { type: "boolean" },
        providerId: { type: "string", maxLength: 128 },
        modelId: { type: "string", maxLength: 256 },
        criteria: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 500 } },
      },
    },
    fallbacks: { type: "array", maxItems: 3, items: { $ref: "#/$defs/selection" } },
    shortRationale: { type: "string", minLength: 1, maxLength: 800 },
  },
  $defs: {
    selection: {
      type: "object",
      additionalProperties: false,
      required: ["providerId", "modelId", "reasoningEffort", "maxOutputTokens"],
      properties: {
        providerId: { type: "string", minLength: 1, maxLength: 128 },
        modelId: { type: "string", minLength: 1, maxLength: 256 },
        reasoningEffort: { type: "string", enum: REASONING_EFFORTS },
        maxOutputTokens: { type: "integer", minimum: 1 },
      },
    },
  },
} as const;

export interface PlanValidationPolicy {
  maxSubtasks: number;
  maxParallelWorkers: number;
  maxOutputTokensPerRequest: number;
  perRequestBudgetUsd: number | null;
  emergencyFallbackEnabled: boolean;
  estimatedInputTokens: number;
  expectedSubtaskOutputTokens: number;
  requiredCapabilities: Capability[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function capabilitySupported(model: ModelEntry, capability: Capability): boolean {
  const map: Record<Capability, boolean | null> = {
    text: model.capabilities.text,
    vision: model.capabilities.imageInput,
    tool_calling: model.capabilities.toolCalling,
    long_context: model.contextWindow === null ? null : model.contextWindow >= 100_000,
    coding: model.capabilities.coding,
    web: model.capabilities.web,
    structured_output: model.capabilities.structuredOutput,
  };
  return map[capability] === true;
}

export function modelKey(providerId: string, modelId: string): string {
  return `${providerId}\u0000${modelId}`;
}

function estimateSelectionCost(model: ModelEntry, inputTokens: number, outputTokens: number): number | null {
  const input = model.pricing.inputPerMillionUsd;
  const output = model.pricing.outputPerMillionUsd;
  if (input === null || output === null) return null;
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}

export function validateRoutingPlan(
  input: unknown,
  snapshot: RegistrySnapshot,
  policy: PlanValidationPolicy,
): ValidationResult<RoutingPlan> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["plan must be an object"] };
  const exactKeys = [
    "schemaVersion", "taskClass", "complexityScore", "riskLevel", "confidence",
    "requiredCapabilities", "executionMode", "primary", "subtasks", "review",
    "fallbacks", "shortRationale",
  ];
  for (const key of Object.keys(input)) if (!exactKeys.includes(key)) errors.push(`unknown plan field: ${key}`);
  for (const key of exactKeys) if (!(key in input)) errors.push(`missing plan field: ${key}`);
  if (input.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!isOneOf(input.taskClass, TASK_CLASSES)) errors.push("invalid taskClass");
  if (!Number.isInteger(input.complexityScore) || Number(input.complexityScore) < 0 || Number(input.complexityScore) > 100) errors.push("complexityScore must be an integer from 0 to 100");
  if (!isOneOf(input.riskLevel, RISK_LEVELS)) errors.push("invalid riskLevel");
  if (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 1) errors.push("confidence must be from 0 to 1");
  if (!isOneOf(input.executionMode, EXECUTION_MODES)) errors.push("invalid executionMode");
  if (typeof input.shortRationale !== "string" || input.shortRationale.length < 1 || input.shortRationale.length > 800) errors.push("shortRationale must be 1-800 characters");

  const requiredCapabilities: Capability[] = [];
  if (!Array.isArray(input.requiredCapabilities)) errors.push("requiredCapabilities must be an array");
  else {
    for (const capability of input.requiredCapabilities) {
      if (!isOneOf(capability, CAPABILITIES)) errors.push(`unknown capability: ${String(capability)}`);
      else if (requiredCapabilities.includes(capability)) errors.push(`duplicate capability: ${capability}`);
      else requiredCapabilities.push(capability);
    }
  }
  for (const capability of policy.requiredCapabilities) {
    if (!requiredCapabilities.includes(capability)) errors.push(`plan omitted required capability: ${capability}`);
  }

  const models = new Map(snapshot.models.map((model) => [modelKey(model.providerId, model.modelId), model]));
  let estimatedCost = 0;
  let hasUnknownCost = false;
  const validateSelection = (value: unknown, location: string, required: Capability[]): ModelSelection | null => {
    if (!isRecord(value)) { errors.push(`${location} must be an object`); return null; }
    const keys = ["providerId", "modelId", "reasoningEffort", "maxOutputTokens"];
    for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`unknown ${location} field: ${key}`);
    const providerId = typeof value.providerId === "string" ? value.providerId : "";
    const modelId = typeof value.modelId === "string" ? value.modelId : "";
    if (!providerId) errors.push(`${location}.providerId is required`);
    if (!modelId) errors.push(`${location}.modelId is required`);
    if (!isOneOf(value.reasoningEffort, REASONING_EFFORTS)) errors.push(`${location}.reasoningEffort is invalid`);
    if (!Number.isInteger(value.maxOutputTokens) || Number(value.maxOutputTokens) < 1) errors.push(`${location}.maxOutputTokens must be a positive integer`);
    const model = models.get(modelKey(providerId, modelId));
    if (!model) errors.push(`${location} references a model outside the validated registry: ${providerId}/${modelId}`);
    else {
      if (!model.enabled || !model.allowed || model.health.status !== "healthy") errors.push(`${location} model is not enabled, allowed, and healthy`);
      if (isOneOf(value.reasoningEffort, REASONING_EFFORTS) && !model.reasoningEfforts.includes(value.reasoningEffort)) errors.push(`${location} effort ${value.reasoningEffort} is unsupported by ${modelId}`);
      const maxOutput = Number(value.maxOutputTokens);
      if (model.maxOutputTokens === null) errors.push(`${location} model output limit is unknown`);
      else if (maxOutput > model.maxOutputTokens) errors.push(`${location} output limit exceeds the model maximum`);
      if (maxOutput > policy.maxOutputTokensPerRequest) errors.push(`${location} output limit exceeds policy`);
      for (const capability of required) if (!capabilitySupported(model, capability)) errors.push(`${location} model does not have confirmed ${capability} capability`);
      const cost = estimateSelectionCost(model, policy.estimatedInputTokens, maxOutput);
      if (cost === null) hasUnknownCost = true; else estimatedCost += cost;
    }
    if (!providerId || !modelId || !isOneOf(value.reasoningEffort, REASONING_EFFORTS) || !Number.isInteger(value.maxOutputTokens)) return null;
    return { providerId, modelId, reasoningEffort: value.reasoningEffort, maxOutputTokens: Number(value.maxOutputTokens) };
  };

  const primary = validateSelection(input.primary, "primary", requiredCapabilities);
  const subtasks: RouteSubtask[] = [];
  const subtaskIds = new Set<string>();
  if (!Array.isArray(input.subtasks)) errors.push("subtasks must be an array");
  else {
    if (input.subtasks.length > policy.maxSubtasks) errors.push(`subtask fan-out exceeds ${policy.maxSubtasks}`);
    for (let index = 0; index < input.subtasks.length; index += 1) {
      const item = input.subtasks[index];
      const location = `subtasks[${index}]`;
      if (!isRecord(item)) { errors.push(`${location} must be an object`); continue; }
      const id = typeof item.id === "string" ? item.id : "";
      const goal = typeof item.goal === "string" ? item.goal : "";
      const providerId = typeof item.providerId === "string" ? item.providerId : "";
      const modelId = typeof item.modelId === "string" ? item.modelId : "";
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) errors.push(`${location}.id is invalid`);
      else if (subtaskIds.has(id)) errors.push(`duplicate subtask id: ${id}`);
      else subtaskIds.add(id);
      if (!goal || goal.length > 2000) errors.push(`${location}.goal is invalid`);
      const dependencies = Array.isArray(item.dependencies) && item.dependencies.every((value) => typeof value === "string") ? item.dependencies as string[] : [];
      if (!Array.isArray(item.dependencies) || dependencies.length !== item.dependencies.length) errors.push(`${location}.dependencies must contain strings`);
      if (new Set(dependencies).size !== dependencies.length) errors.push(`${location}.dependencies contains duplicates`);
      if (!isOneOf(item.reasoningEffort, REASONING_EFFORTS)) errors.push(`${location}.reasoningEffort is invalid`);
      const model = models.get(modelKey(providerId, modelId));
      if (!model) errors.push(`${location} references a model outside the validated registry: ${providerId}/${modelId}`);
      else {
        if (!model.enabled || !model.allowed || model.health.status !== "healthy") errors.push(`${location} model is not enabled, allowed, and healthy`);
        if (isOneOf(item.reasoningEffort, REASONING_EFFORTS) && !model.reasoningEfforts.includes(item.reasoningEffort)) errors.push(`${location} reasoning effort is unsupported`);
        for (const capability of requiredCapabilities) if (!capabilitySupported(model, capability)) errors.push(`${location} model does not have confirmed ${capability} capability`);
        const cost = estimateSelectionCost(model, policy.estimatedInputTokens, policy.expectedSubtaskOutputTokens);
        if (cost === null) hasUnknownCost = true; else estimatedCost += cost;
      }
      if (id && goal && providerId && modelId && isOneOf(item.reasoningEffort, REASONING_EFFORTS)) {
        subtasks.push({ id, goal, dependencies, providerId, modelId, reasoningEffort: item.reasoningEffort });
      }
    }
  }

  for (const subtask of subtasks) {
    for (const dependency of subtask.dependencies) {
      if (!subtaskIds.has(dependency)) errors.push(`subtask ${subtask.id} has unknown dependency ${dependency}`);
      if (dependency === subtask.id) errors.push(`subtask ${subtask.id} depends on itself`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of subtaskIds) if (visit(id)) { errors.push("subtask dependency graph contains a cycle"); break; }

  let review: ReviewPlan | null = null;
  if (!isRecord(input.review) || typeof input.review.required !== "boolean" || !Array.isArray(input.review.criteria)) errors.push("review is invalid");
  else {
    const providerId = typeof input.review.providerId === "string" ? input.review.providerId : "";
    const modelId = typeof input.review.modelId === "string" ? input.review.modelId : "";
    const criteria = input.review.criteria.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 500);
    if (criteria.length !== input.review.criteria.length || criteria.length > 12) errors.push("review.criteria is invalid");
    if (input.review.required) {
      const model = models.get(modelKey(providerId, modelId));
      if (!model) errors.push("review references a model outside the validated registry");
      else {
        if (!model.enabled || !model.allowed || model.health.status !== "healthy") errors.push("review model is not enabled, allowed, and healthy");
        if (model.capabilities.text !== true) errors.push("review model does not have confirmed text capability");
        const cost = estimateSelectionCost(model, policy.estimatedInputTokens, policy.expectedSubtaskOutputTokens);
        if (cost === null) hasUnknownCost = true; else estimatedCost += cost;
      }
      if (!providerId || !modelId) errors.push("required review needs providerId and modelId");
      if (primary) {
        const primaryModel = models.get(modelKey(primary.providerId, primary.modelId));
        if (primaryModel) {
          const revisionCost = estimateSelectionCost(primaryModel, policy.estimatedInputTokens + primary.maxOutputTokens + policy.expectedSubtaskOutputTokens, primary.maxOutputTokens);
          if (revisionCost === null) hasUnknownCost = true; else estimatedCost += revisionCost;
        }
      }
    }
    review = { required: input.review.required, providerId, modelId, criteria };
  }

  const fallbacks: ModelSelection[] = [];
  if (!Array.isArray(input.fallbacks)) errors.push("fallbacks must be an array");
  else {
    if (input.fallbacks.length > 3) errors.push("too many fallbacks");
    if (input.fallbacks.length > 0 && !policy.emergencyFallbackEnabled) errors.push("fallbacks were proposed but emergency fallback policy is disabled");
    for (let index = 0; index < input.fallbacks.length; index += 1) {
      const fallback = validateSelection(input.fallbacks[index], `fallbacks[${index}]`, requiredCapabilities);
      if (fallback) fallbacks.push(fallback);
    }
  }

  if (input.executionMode === "direct" && subtasks.length > 0) errors.push("direct execution cannot have subtasks");
  if (input.executionMode === "decomposed" && subtasks.length === 0) errors.push("decomposed execution requires subtasks");
  if (input.executionMode === "parallel_review" && !review?.required) errors.push("parallel_review requires a reviewer");
  if (subtasks.length > 0 && policy.maxParallelWorkers < 1) errors.push("parallel worker policy prevents subtasks");
  if (policy.perRequestBudgetUsd !== null) {
    if (hasUnknownCost) errors.push("cannot validate budget because selected model pricing is unknown");
    else if (estimatedCost > policy.perRequestBudgetUsd) errors.push(`estimated plan cost $${estimatedCost.toFixed(6)} exceeds per-request budget`);
  }

  if (errors.length > 0 || !primary || !review || !isOneOf(input.taskClass, TASK_CLASSES) || !isOneOf(input.riskLevel, RISK_LEVELS) || !isOneOf(input.executionMode, EXECUTION_MODES) || typeof input.confidence !== "number" || !Number.isInteger(input.complexityScore) || typeof input.shortRationale !== "string") {
    return { ok: false, errors: [...new Set(errors)] };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      taskClass: input.taskClass,
      complexityScore: Number(input.complexityScore),
      riskLevel: input.riskLevel,
      confidence: input.confidence,
      requiredCapabilities,
      executionMode: input.executionMode,
      primary,
      subtasks,
      review,
      fallbacks,
      shortRationale: input.shortRationale,
    },
  };
}

export function newRouteId(now = Date.now()): string {
  const timestamp = now.toString(36).padStart(10, "0").toUpperCase();
  const random = randomBytes(10).toString("base64url").slice(0, 16).toUpperCase();
  return `${timestamp}${random}`;
}

export function attributionBadge(record: AttributionRecord): string {
  const hostNote = record.hostModelAuthoritative && record.hostModel ? ` · host: ${record.hostModel}` : "";
  return [
    `OmniRoute · orchestrator: ${record.orchestrator.providerId}/${record.orchestrator.modelId} (${record.orchestrator.reasoningEffort})`,
    `worker: ${record.worker.providerId}/${record.worker.modelId} (${record.worker.reasoningEffort}) · task: ${record.taskClass} · route: ${record.routeId}${hostNote}`,
  ].join("\n");
}
