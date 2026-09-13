import type { OmniConfig } from "@omniroute/config";
import type { AttributionRecord, Capability, ModelEntry, ModelSelection, RegistrySnapshot, RoutingDiagnostic, TaskClass } from "@omniroute/contracts";
import type { ProviderAdapter } from "@omniroute/providers";
import { SafeError } from "@omniroute/observability";

export function supports(model: ModelEntry, capability: Capability): boolean {
  return ({ text: model.capabilities.text, vision: model.capabilities.imageInput, tool_calling: model.capabilities.toolCalling, long_context: (model.contextWindow ?? 0) >= 100_000, coding: model.capabilities.coding, web: model.capabilities.web, structured_output: model.capabilities.structuredOutput })[capability] === true;
}

interface FailoverAudit {
  fallbackAttempts: AttributionRecord["fallbacksAttempted"];
  policyDecisions: string[];
  routingDiagnostics?: RoutingDiagnostic[];
}

export interface SelectionPolicy {
  taskClass?: TaskClass;
  minimumTier?: number;
  minimumOutputTokens?: number;
  reserveTokens?: number;
  pin?: { providerId: string; modelId?: string };
}

export type ModelPreference = "quality" | "lightweight";

/** Deterministic free-only routing. No provider/model is learned from an error or a planner. */
export class FreeModelFailover {
  private readonly providerSelections = new Map<string, number>();
  private readonly modelSelections = new Map<string, number>();
  private readonly active = new Map<string, number>();
  private readonly limitedUntil = new Map<string, number>();
  constructor(private readonly config: OmniConfig, private readonly providers: Map<string, ProviderAdapter>, private readonly now: () => number = Date.now) {}

  enabled(selection: ModelSelection, snapshot: RegistrySnapshot): boolean {
    const model = snapshot.models.find((item) => item.providerId === selection.providerId && item.modelId === selection.modelId);
    return this.config.routing.freeOnly && this.config.routing.freeModelFailoverEnabled && !!model && this.free(model);
  }

  private free(model: ModelEntry): boolean {
    const settings = this.config.providers.find((item) => item.id === model.providerId);
    return !!settings?.enabled && settings.freeTierOnly && model.pricing.inputPerMillionUsd === 0 && model.pricing.outputPerMillionUsd === 0;
  }

  private key(selection: Pick<ModelSelection, "providerId" | "modelId">): string { return `${selection.providerId}\0${selection.modelId}`; }
  private cooling(model: Pick<ModelSelection, "providerId" | "modelId">): boolean {
    const key = this.key(model), until = this.limitedUntil.get(key);
    if (until === undefined) return false;
    if (until <= this.now()) { this.limitedUntil.delete(key); return false; }
    return true;
  }

  diagnostics(initial: ModelSelection, snapshot: RegistrySnapshot, required: Capability[], inputTokens: number, policy: SelectionPolicy = {}): RoutingDiagnostic {
    const classes = ["micro", "small", "medium", "large", "critical"];
    const candidates = snapshot.models.map(model => {
      const settings = this.config.providers.find(item => item.id === model.providerId);
      const reasons: string[] = [];
      if (!settings?.enabled) reasons.push("PROVIDER_DISABLED");
      if (!this.providers.has(model.providerId)) reasons.push("ADAPTER_UNAVAILABLE");
      if (!this.free(model)) reasons.push("FREE_POLICY");
      if (!model.enabled) reasons.push("MODEL_DISABLED");
      if (!model.allowed) reasons.push("MODEL_DENIED");
      if (model.health.status !== "healthy") reasons.push("HEALTH_" + model.health.status.toUpperCase());
      if (model.rateLimitState === "limited") reasons.push("QUOTA_LIMITED");
      if (this.cooling(model)) reasons.push("COOLDOWN");
      const maximum = settings?.maxTaskClass ?? (model.providerId.endsWith("-consumer") ? "small" : undefined);
      if (maximum && (!policy.taskClass || classes.indexOf(policy.taskClass) > classes.indexOf(maximum))) reasons.push("TASK_CLASS_LIMIT");
      if (policy.minimumTier && (model.intelligenceTier ?? 0) < policy.minimumTier) reasons.push("QUALITY_FLOOR");
      const concurrentLimit = settings?.maxConcurrentRequests ?? (model.providerId.endsWith("-consumer") ? 1 : this.config.daemon.maxConcurrentRoutes);
      if ((this.active.get(model.providerId) ?? 0) >= concurrentLimit) reasons.push("CONCURRENCY_LIMIT");
      for (const capability of required) if (!supports(model, capability)) reasons.push("CAPABILITY_" + capability.toUpperCase());
      if (policy.minimumOutputTokens && policy.minimumOutputTokens > Math.min(model.maxOutputTokens ?? 0, this.config.routing.maxOutputTokensPerRequest)) reasons.push("OUTPUT_LIMIT");
      if (model.contextWindow === null || model.maxOutputTokens === null || model.maxOutputTokens <= 0 || !model.reasoningEfforts.length) reasons.push("LIMITS_UNKNOWN");
      else if (inputTokens + Math.min(initial.maxOutputTokens, model.maxOutputTokens, this.config.routing.maxOutputTokensPerRequest) > model.contextWindow) reasons.push("CONTEXT_LIMIT");
      if (policy.pin && (model.providerId !== policy.pin.providerId || (policy.pin.modelId && model.modelId !== policy.pin.modelId))) reasons.push("PIN_MISMATCH");
      return { providerId: model.providerId, modelId: model.modelId, health: model.health.status, eligible: reasons.length === 0, reasons: reasons.length ? reasons : ["ELIGIBLE"] };
    });
    for (const settings of this.config.providers) if (!snapshot.models.some(model => model.providerId === settings.id)) {
      candidates.push({ providerId: settings.id, modelId: "", health: "unknown", eligible: false, reasons: [settings.enabled ? "REGISTRY_UNAVAILABLE" : "PROVIDER_DISABLED"] });
    }
    return { phase: "selection", reason: "NO_ELIGIBLE_CANDIDATE", selected: null, ...(policy.taskClass ? {taskClass: policy.taskClass} : {}), requiredCapabilities: [...required], inputTokens, candidates };
  }

  /** Least dispatched provider, then least dispatched equally ranked model. Counts advance before I/O. */
  select(initial: ModelSelection, snapshot: RegistrySnapshot, required: Capability[], inputTokens: number, preference: ModelPreference = "quality", policy: SelectionPolicy = {}): { selection: ModelSelection | undefined; diagnostic: RoutingDiagnostic } {
    const diagnostic = this.diagnostics(initial, snapshot, required, inputTokens, policy);
    const candidates = this.candidates(initial, snapshot, required, inputTokens, preference, policy);
    const priority = (id: string) => this.config.routing.providerPriorities?.[id] ?? 0;
    const providerIds = [...new Set(candidates.map(item => item.providerId))];
    const explicitPriority = Math.max(...providerIds.map(priority));
    const preferred = providerIds.filter(id => priority(id) === explicitPriority);
    const ordered = this.config.routing.selectionPolicy === "priority";
    preferred.sort((a, b) => ordered ? providerIds.indexOf(a) - providerIds.indexOf(b) : (this.providerSelections.get(a) ?? 0) - (this.providerSelections.get(b) ?? 0) || providerIds.indexOf(a) - providerIds.indexOf(b));
    const pool = candidates.filter(item => item.providerId === preferred[0]);
    // Preserve curated model ranks and intent; spread traffic only among equal model ranks.
    const rank = (selection: ModelSelection) => {
      const model = snapshot.models.find(item => this.key(item) === this.key(selection))!;
      const order = this.config.providers.find(item => item.id === selection.providerId)?.freeModelOrder ?? [];
      const index = order.indexOf(model.modelId);
      return JSON.stringify([model.intelligenceTier, index < 0 ? null : index, model.capabilities.web === true && !required.includes("web"), model.latencyTier]);
    };
    const peers = pool.length ? pool.filter(item => rank(item) === rank(pool[0]!)) : [];
    if (!ordered) peers.sort((a, b) => (this.modelSelections.get(this.key(a)) ?? 0) - (this.modelSelections.get(this.key(b)) ?? 0));
    const selection = peers[0];
    if (selection) {
      this.providerSelections.set(selection.providerId, (this.providerSelections.get(selection.providerId) ?? 0) + 1);
      this.modelSelections.set(this.key(selection), (this.modelSelections.get(this.key(selection)) ?? 0) + 1);
      diagnostic.selected = {providerId: selection.providerId, modelId: selection.modelId};
      diagnostic.reason = policy.pin ? "EXPLICIT_PIN" : providerIds.length === 1 ? "ONLY_ELIGIBLE_PROVIDER" : explicitPriority !== 0 ? "EXPLICIT_PROVIDER_PRIORITY" : ordered ? "PROVIDER_ORDER_PRIORITY" : "BALANCED_LEAST_DISPATCHED";
    }
    return {selection, diagnostic};
  }

  candidates(initial: ModelSelection, snapshot: RegistrySnapshot, required: Capability[], inputTokens: number, preference: ModelPreference = "quality", policy: SelectionPolicy = {}): ModelSelection[] {
    const providerOrder = [initial.providerId, ...this.config.routing.directProviderOrder.filter((id) => id !== initial.providerId)];
    const modelOrder = (model: ModelEntry): number => {
      const settings = this.config.providers.find((item) => item.id === model.providerId);
      const ids = settings?.freeModelOrder ?? [];
      const index = ids.indexOf(model.modelId);
      return index < 0 ? 999 : index;
    };
    const providerRank = (id: string): number => { const rank = providerOrder.indexOf(id); return rank < 0 ? 999 : rank; };
    const eligible = new Set(this.diagnostics(initial, snapshot, required, inputTokens, policy).candidates.filter(item => item.eligible).map(item => this.key(item)));
    const models = snapshot.models.filter(model => eligible.has(this.key(model)));
    const withinProvider = (a: ModelEntry, b: ModelEntry): number => preference === "lightweight"
      ? (a.intelligenceTier ?? 999) - (b.intelligenceTier ?? 999) || Number(a.capabilities.web === true && !required.includes("web")) - Number(b.capabilities.web === true && !required.includes("web")) || (modelOrder(a) === 999 || modelOrder(b) === 999 ? modelOrder(a) - modelOrder(b) : modelOrder(b) - modelOrder(a))
      : modelOrder(a) - modelOrder(b) || (b.intelligenceTier ?? 0) - (a.intelligenceTier ?? 0);
    models.sort((a, b) => providerRank(a.providerId) - providerRank(b.providerId) || a.providerId.localeCompare(b.providerId) || withinProvider(a, b) || (a.latencyTier ?? 9) - (b.latencyTier ?? 9) || a.modelId.localeCompare(b.modelId));
    return models.map((model) => ({ providerId: model.providerId, modelId: model.modelId, maxOutputTokens: Math.min(initial.maxOutputTokens, model.maxOutputTokens!, this.config.routing.maxOutputTokensPerRequest), reasoningEffort: model.reasoningEfforts.includes(initial.reasoningEffort) ? initial.reasoningEffort : model.reasoningEfforts.includes("none") ? "none" : model.reasoningEfforts[0]! }));
  }

  async run<T>(initial: ModelSelection, snapshot: RegistrySnapshot, required: Capability[], inputTokens: number, signal: AbortSignal, audit: FailoverAudit, label: string, operation: (selection: ModelSelection, automatic: boolean) => Promise<T>, preference: ModelPreference = "quality", policy: SelectionPolicy = {}): Promise<{ value: T; selection: ModelSelection }> {
    inputTokens += policy.reserveTokens ?? 0;
    const automatic = this.enabled(initial, snapshot);
    const eligible = this.config.routing.freeOnly ? this.candidates(initial, snapshot, required, inputTokens, preference, policy) : [initial];
    const candidates = automatic ? eligible : eligible.filter(item => this.key(item) === this.key(initial));
    // A selected model is a decision, not a hint to silently upgrade/downgrade.
    candidates.sort((a, b) => Number(this.key(b) === this.key(initial)) - Number(this.key(a) === this.key(initial)));
    const diagnostic = this.diagnostics(initial, snapshot, required, inputTokens, policy);
    diagnostic.phase = "execution";
    diagnostic.reason = candidates.some(item => this.key(item) === this.key(initial)) ? "SELECTED_CANDIDATE_FIRST" : "SELECTED_CANDIDATE_INELIGIBLE";
    audit.routingDiagnostics?.push(diagnostic);
    let lastError: unknown = new SafeError("FREE_MODELS_UNAVAILABLE", "No eligible free model is available outside its cooldown", 503);
    let failures = 0;
    for (const selection of candidates) {
      if (signal.aborted) throw signal.reason;
      if (this.config.routing.freeOnly && !this.candidates(selection, snapshot, required, inputTokens, preference, policy).some(item => this.key(item) === this.key(selection))) {
        audit.policyDecisions.push("FALLBACK_CANDIDATE_BECAME_UNAVAILABLE");
        continue;
      }
      this.active.set(selection.providerId, (this.active.get(selection.providerId) ?? 0) + 1);
      try {
        const value = await operation(selection, automatic);
        diagnostic.selected = {providerId: selection.providerId, modelId: selection.modelId};
        diagnostic.reason = failures > 0 ? "FALLBACK_AFTER_FAILURE" : this.key(selection) !== this.key(initial) ? "FALLBACK_SELECTED_INELIGIBLE" : "SELECTED_CANDIDATE_SUCCEEDED";
        if (failures > 0 || this.key(selection) !== this.key(initial)) {
          audit.fallbackAttempts.push({ providerId: selection.providerId, modelId: selection.modelId, outcome: `${label}: completed` });
          audit.policyDecisions.push(`${label}: ${diagnostic.reason} ${selection.providerId}/${selection.modelId}`);
        }
        return { value, selection };
      } catch (error) {
        if (!automatic || signal.aborted || (error instanceof SafeError && error.code === "STREAM_PARTIAL")) throw error;
        const failure = this.providers.get(selection.providerId)!.classifyError(error);
        if (!["rate_limit", "transient", "timeout", "unavailable"].includes(failure.category)) throw error;
        lastError = error;
        failures += 1;
        if (["rate_limit", "transient", "timeout", "unavailable"].includes(failure.category)) {
          const delay = failure.retryAfterMs ?? this.config.routing.freeModelCooldownMs;
          this.limitedUntil.set(this.key(selection), this.now() + Math.max(1000, Math.min(86_400_000, Number.isFinite(delay) ? delay : this.config.routing.freeModelCooldownMs)));
        }
        audit.fallbackAttempts.push({ providerId: selection.providerId, modelId: selection.modelId, outcome: `${label}: ${failure.category}` });
        audit.policyDecisions.push(`${label}: ${selection.providerId}/${selection.modelId} ${failure.category}; trying remaining eligible same-provider models before another provider`);
      } finally {
        this.active.set(selection.providerId, Math.max(0, (this.active.get(selection.providerId) ?? 1) - 1));
      }
    }
    throw lastError;
  }
}
