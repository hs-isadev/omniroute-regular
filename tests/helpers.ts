import type { OmniConfig } from "@omniroute/config";
import { DEFAULT_CONFIG } from "@omniroute/config";
import {
  ORCHESTRATOR_MODEL_ID,
  REASONING_EFFORTS,
  type ModelEntry,
  type RegistrySnapshot,
  type RoutingPlan,
} from "@omniroute/contracts";

export function configFixture(): OmniConfig {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as OmniConfig;
  config.routing.defaultMode = "orchestrator";
  config.routing.freeOnly = false;
  config.routing.orchestratorProviderId = "openai";
  config.routing.orchestratorModelId = ORCHESTRATOR_MODEL_ID;
  config.routing.directProviderOrder = ["openai"];
  for (const provider of config.providers) provider.enabled = provider.id === "openai";
  config.budgets.dailyUsd = 10;
  config.budgets.monthlyUsd = 100;
  config.budgets.perRequestUsd = 2;
  config.budgets.taskClassMaximum = { micro: 0.05, small: 0.2, medium: 0.75, large: 2, critical: 5 };
  return config;
}

export function freeConfigFixture(): OmniConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as OmniConfig;
}

export function modelFixture(overrides: Partial<ModelEntry> = {}): ModelEntry {
  const base: ModelEntry = {
    providerId: "openai",
    modelId: ORCHESTRATOR_MODEL_ID,
    name: "GPT-5.6 Sol",
    enabled: true,
    health: { status: "healthy", checkedAt: new Date(0).toISOString(), latencyMs: 1, message: null },
    capabilities: { text: true, imageInput: true, imageOutput: false, audioInput: false, audioOutput: false, toolCalling: true, structuredOutput: true, web: true, coding: true },
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: [...REASONING_EFFORTS],
    intelligenceTier: 5,
    latencyTier: 5,
    pricing: { inputPerMillionUsd: 4, outputPerMillionUsd: 20, cachedInputPerMillionUsd: 0.4, updatedAt: null },
    dataRegion: null,
    privacyLabels: [],
    rateLimitState: "ok",
    allowed: true,
    discoveredAt: new Date(0).toISOString(),
    source: "documented",
  };
  return { ...base, ...overrides, health: { ...base.health, ...(overrides.health ?? {}) }, capabilities: { ...base.capabilities, ...(overrides.capabilities ?? {}) }, pricing: { ...base.pricing, ...(overrides.pricing ?? {}) } };
}

export function registryFixture(models: ModelEntry[] = [modelFixture()]): RegistrySnapshot {
  return { id: "registry-test", createdAt: new Date(0).toISOString(), models };
}

export function planFixture(overrides: Partial<RoutingPlan> = {}): RoutingPlan {
  return {
    schemaVersion: 1,
    taskClass: "small",
    complexityScore: 20,
    riskLevel: "low",
    confidence: 0.9,
    requiredCapabilities: ["text"],
    executionMode: "delegated",
    primary: { providerId: "openai", modelId: "gpt-5.6-luna", reasoningEffort: "low", maxOutputTokens: 1_000 },
    subtasks: [],
    review: { required: false, providerId: "", modelId: "", criteria: [] },
    fallbacks: [],
    shortRationale: "A focused low-risk request fits the efficient worker.",
    ...overrides,
  };
}

export function lunaFixture(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return modelFixture({
    modelId: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    intelligenceTier: 3,
    latencyTier: 1,
    pricing: { inputPerMillionUsd: 0.2, outputPerMillionUsd: 1.2, cachedInputPerMillionUsd: 0.02, updatedAt: null },
    ...overrides,
  });
}
