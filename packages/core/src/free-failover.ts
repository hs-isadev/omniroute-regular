import type { OmniConfig } from "@omniroute/config";
import type { AttributionRecord, Capability, ModelEntry, ModelSelection, RegistrySnapshot } from "@omniroute/contracts";
import type { ProviderAdapter } from "@omniroute/providers";
import { SafeError } from "@omniroute/observability";

export function supports(model: ModelEntry, capability: Capability): boolean {
  return ({ text: model.capabilities.text, vision: model.capabilities.imageInput, tool_calling: model.capabilities.toolCalling, long_context: (model.contextWindow ?? 0) >= 100_000, coding: model.capabilities.coding, web: model.capabilities.web, structured_output: model.capabilities.structuredOutput })[capability] === true;
}

interface FailoverAudit {
  fallbackAttempts: AttributionRecord["fallbacksAttempted"];
  policyDecisions: string[];
}

export type ModelPreference = "quality" | "lightweight";

/** Deterministic free-only routing. No provider/model is learned from an error or a planner. */
export class FreeModelFailover {
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

  candidates(initial: ModelSelection, snapshot: RegistrySnapshot, required: Capability[], inputTokens: number, preference: ModelPreference = "quality"): ModelSelection[] {
    const providerOrder = [initial.providerId, ...this.config.routing.directProviderOrder.filter((id) => id !== initial.providerId)];
    const modelOrder = (model: ModelEntry): number => {
      const settings = this.config.providers.find((item) => item.id === model.providerId);
      const ids = settings?.freeModelOrder ?? [];
      const index = ids.indexOf(model.modelId);
      return index < 0 ? 999 : index;
    };
    const providerRank = (id: string): number => { const rank = providerOrder.indexOf(id); return rank < 0 ? 999 : rank; };
    const models = snapshot.models.filter((model) => this.providers.has(model.providerId) && this.free(model) && model.enabled && model.allowed && model.health.status === "healthy" && !this.cooling(model) && required.every((capability) => supports(model, capability)) && model.contextWindow !== null && model.maxOutputTokens !== null && model.maxOutputTokens > 0 && model.reasoningEfforts.length > 0 && inputTokens + Math.min(initial.maxOutputTokens, model.maxOutputTokens, this.config.routing.maxOutputTokensPerRequest) <= model.contextWindow);
    const withinProvider = (a: ModelEntry, b: ModelEntry): number => preference === "lightweight"
      ? (a.intelligenceTier ?? 999) - (b.intelligenceTier ?? 999) || Number(a.capabilities.web === true && !required.includes("web")) - Number(b.capabilities.web === true && !required.includes("web")) || (modelOrder(a) === 999 || modelOrder(b) === 999 ? modelOrder(a) - modelOrder(b) : modelOrder(b) - modelOrder(a))
      : modelOrder(a) - modelOrder(b) || (b.intelligenceTier ?? 0) - (a.intelligenceTier ?? 0);
    models.sort((a, b) => providerRank(a.providerId) - providerRank(b.providerId) || a.providerId.localeCompare(b.providerId) || withinProvider(a, b) || (a.latencyTier ?? 9) - (b.latencyTier ?? 9) || a.modelId.localeCompare(b.modelId));
    return models.map((model) => ({ providerId: model.providerId, modelId: model.modelId, maxOutputTokens: Math.min(initial.maxOutputTokens, model.maxOutputTokens!, this.config.routing.maxOutputTokensPerRequest), reasoningEffort: model.reasoningEfforts.includes(initial.reasoningEffort) ? initial.reasoningEffort : model.reasoningEfforts.includes("none") ? "none" : model.reasoningEfforts[0]! }));
  }

  async run<T>(initial: ModelSelection, snapshot: RegistrySnapshot, required: Capability[], inputTokens: number, signal: AbortSignal, audit: FailoverAudit, label: string, operation: (selection: ModelSelection, automatic: boolean) => Promise<T>, preference: ModelPreference = "quality"): Promise<{ value: T; selection: ModelSelection }> {
    const automatic = this.enabled(initial, snapshot);
    const candidates = automatic ? this.candidates(initial, snapshot, required, inputTokens, preference) : [initial];
    let lastError: unknown = new SafeError("FREE_MODELS_UNAVAILABLE", "No eligible free model is available outside its cooldown", 503);
    let failures = 0;
    for (const selection of candidates) {
      if (signal.aborted) throw signal.reason;
      if (automatic && this.cooling(selection)) continue;
      try {
        const value = await operation(selection, automatic);
        if (failures > 0 || this.key(selection) !== this.key(initial)) {
          audit.fallbackAttempts.push({ providerId: selection.providerId, modelId: selection.modelId, outcome: `${label}: completed` });
          audit.policyDecisions.push(`${label}: provider-first free selection ${selection.providerId}/${selection.modelId}`);
        }
        return { value, selection };
      } catch (error) {
        if (!automatic || signal.aborted || (error instanceof SafeError && error.code === "STREAM_PARTIAL")) throw error;
        const failure = this.providers.get(selection.providerId)!.classifyError(error);
        if (!["rate_limit", "transient", "timeout", "unavailable"].includes(failure.category)) throw error;
        lastError = error;
        failures += 1;
        if (failure.category === "rate_limit") {
          const delay = failure.retryAfterMs ?? this.config.routing.freeModelCooldownMs;
          this.limitedUntil.set(this.key(selection), this.now() + Math.max(1000, Math.min(86_400_000, Number.isFinite(delay) ? delay : this.config.routing.freeModelCooldownMs)));
        }
        audit.fallbackAttempts.push({ providerId: selection.providerId, modelId: selection.modelId, outcome: `${label}: ${failure.category}` });
        audit.policyDecisions.push(`${label}: ${selection.providerId}/${selection.modelId} ${failure.category}; trying remaining eligible same-provider models before another provider`);
      }
    }
    throw lastError;
  }
}
