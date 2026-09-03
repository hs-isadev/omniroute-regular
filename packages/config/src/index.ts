import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isIP } from "node:net";
import { ORCHESTRATOR_MODEL_ID, type Capability, type ReasoningEffort, REASONING_EFFORTS, ROUTING_MODES, type RoutingMode, TASK_CLASSES, type TaskClass } from "@omniroute/contracts";
import { addDefaultFreeLadders, EXTRA_FREE_PROVIDERS, extraProviderSettings } from "./provider-catalog.js";
export { EXTRA_FREE_PROVIDERS, freeWorkerModel } from "./provider-catalog.js";

export interface RuntimePaths {
  root: string;
  config: string;
  vaultDir: string;
  vault: string;
  importDir: string;
  credentialsImport: string;
  logsDir: string;
  log: string;
  routesDir: string;
  routes: string;
  backupsDir: string;
  stateDir: string;
  daemonState: string;
  integrationsDir: string;
}

export interface ProviderSettings {
  id: string;
  type: "openai" | "anthropic" | "openai-compatible" | "local" | "mcp-stdio";
  enabled: boolean;
  freeTierOnly: boolean;
  freeTierConfirmed?: boolean;
  freeModelOrder?: string[];
  credentialField: string | null;
  baseUrl: string;
  apiPrefix: string;
  mcpCommand?: string;
  mcpArgs?: string[];
  mcpWorkingDirectory?: string;
  maxTaskClass?: TaskClass;
  discoveryTtlSeconds: number;
  models: Array<{
    modelId: string;
    enabled: boolean;
    allowed: boolean;
    capabilities: Partial<Record<Capability, boolean>>;
    contextWindow: number | null;
    maxOutputTokens: number | null;
    reasoningEfforts: ReasoningEffort[];
    inputPerMillionUsd: number | null;
    outputPerMillionUsd: number | null;
    intelligenceTier: 1 | 2 | 3 | 4 | 5 | null;
    latencyTier: 1 | 2 | 3 | 4 | 5 | null;
  }>;
}

export interface OmniConfig {
  schemaVersion: 1;
  daemon: {
    host: "127.0.0.1";
    port: number;
    allowedOrigins: string[];
    maxRequestBytes: number;
    requestsPerMinute: number;
    maxConcurrentRoutes: number;
    routeTimeoutMs: number;
  };
  routing: {
    defaultMode: RoutingMode;
    freeOnly: boolean;
    freeModelFailoverEnabled: boolean;
    intentRoutingEnabled: boolean;
    freeModelCooldownMs: number;
    orchestratorProviderId: string;
    orchestratorModelId: string;
    directProviderOrder: string[];
    defaultOrchestratorEffort: ReasoningEffort;
    ambiguousOrchestratorEffort: ReasoningEffort;
    repairInvalidPlanOnce: boolean;
    emergencyFallbackEnabled: boolean;
    maxSubtasks: number;
    maxParallelWorkers: number;
    maxOutputTokensPerRequest: number;
    expectedSubtaskOutputTokens: number;
    modelHealthTtlSeconds: number;
  };
  budgets: {
    dailyUsd: number | null;
    monthlyUsd: number | null;
    perRequestUsd: number | null;
    taskClassMaximum: Record<string, number | null>;
  };
  privacy: {
    privacyMode: boolean;
    retainContent: boolean;
    contentRetentionDays: number;
    metadataRetentionDays: number;
    localTelemetryOnly: true;
  };
  reliability: {
    retryLimit: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
  };
  providers: ProviderSettings[];
}

const openAiModels: ProviderSettings["models"] = [
  {
    modelId: ORCHESTRATOR_MODEL_ID,
    enabled: true,
    allowed: true,
    capabilities: { text: true, vision: true, tool_calling: true, long_context: true, coding: true, web: true, structured_output: true },
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: [...REASONING_EFFORTS],
    inputPerMillionUsd: 4,
    outputPerMillionUsd: 20,
    intelligenceTier: 5,
    latencyTier: 5,
  },
  {
    modelId: "gpt-5.6-terra",
    enabled: true,
    allowed: true,
    capabilities: { text: true, vision: true, tool_calling: true, long_context: true, coding: true, web: true, structured_output: true },
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: [...REASONING_EFFORTS],
    inputPerMillionUsd: 2,
    outputPerMillionUsd: 12,
    intelligenceTier: 4,
    latencyTier: 3,
  },
  {
    modelId: "gpt-5.6-luna",
    enabled: true,
    allowed: true,
    capabilities: { text: true, vision: true, tool_calling: true, long_context: true, coding: true, web: true, structured_output: true },
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: [...REASONING_EFFORTS],
    inputPerMillionUsd: 0.2,
    outputPerMillionUsd: 1.2,
    intelligenceTier: 3,
    latencyTier: 1,
  },
];

export const DEFAULT_CONFIG: OmniConfig = {
  schemaVersion: 1,
  daemon: {
    host: "127.0.0.1",
    port: 47831,
    allowedOrigins: ["http://127.0.0.1:47831"],
    maxRequestBytes: 2_000_000,
    requestsPerMinute: 60,
    maxConcurrentRoutes: 4,
    routeTimeoutMs: 300_000,
  },
  routing: {
    defaultMode: "regular",
    freeOnly: true,
    freeModelFailoverEnabled: true,
    intentRoutingEnabled: true,
    freeModelCooldownMs: 60_000,
    orchestratorProviderId: "openrouter",
    orchestratorModelId: "openrouter/free",
    directProviderOrder: ["claude-consumer", "zai-consumer", "qwen-consumer", "kimi-consumer", "deepseek-consumer", "perplexity-consumer", "groq", "gemini", "openrouter", "ollama"],
    defaultOrchestratorEffort: "low",
    ambiguousOrchestratorEffort: "medium",
    repairInvalidPlanOnce: true,
    emergencyFallbackEnabled: false,
    maxSubtasks: 8,
    maxParallelWorkers: 3,
    maxOutputTokensPerRequest: 32_000,
    expectedSubtaskOutputTokens: 4_000,
    modelHealthTtlSeconds: 300,
  },
  budgets: {
    dailyUsd: 0,
    monthlyUsd: 0,
    perRequestUsd: 0,
    taskClassMaximum: { micro: 0, small: 0, medium: 0, large: 0, critical: 0 },
  },
  privacy: {
    privacyMode: false,
    retainContent: false,
    contentRetentionDays: 0,
    metadataRetentionDays: 90,
    localTelemetryOnly: true,
  },
  reliability: { retryLimit: 2, retryBaseDelayMs: 500, retryMaxDelayMs: 10_000 },
  providers: [
    ...extraProviderSettings(),
    { id: "claude-consumer", type: "mcp-stdio", enabled: false, freeTierOnly: true, credentialField: null, baseUrl: "http://127.0.0.1:9222", apiPrefix: "", mcpCommand: "node", mcpArgs: [], maxTaskClass: "small", discoveryTtlSeconds: 60, models: [{ modelId: "claude-web-consumer", enabled: true, allowed: true, capabilities: { text: true, coding: true, structured_output: false, web: false, tool_calling: false }, contextWindow: 32_768, maxOutputTokens: 4_096, reasoningEfforts: ["none"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 4, latencyTier: 3 }] },
    { id: "zai-consumer", type: "mcp-stdio", enabled: false, freeTierOnly: true, credentialField: null, baseUrl: "http://127.0.0.1:9222", apiPrefix: "", mcpCommand: "node", mcpArgs: [], maxTaskClass: "small", discoveryTtlSeconds: 60, models: [{ modelId: "glm-web-consumer", enabled: true, allowed: true, capabilities: { text: true, coding: true, structured_output: false, web: false, tool_calling: false }, contextWindow: 32_768, maxOutputTokens: 4_096, reasoningEfforts: ["none"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 4, latencyTier: 3 }] },
    ...[
      ["qwen-consumer", "qwen-web-consumer"], ["kimi-consumer", "kimi-web-consumer"], ["deepseek-consumer", "deepseek-web-consumer"], ["perplexity-consumer", "perplexity-web-consumer"],
    ].map(([id, modelId]) => ({ id: id!, type: "mcp-stdio" as const, enabled: false, freeTierOnly: true, credentialField: null, baseUrl: "http://127.0.0.1:9222", apiPrefix: "", mcpCommand: "node", mcpArgs: [], maxTaskClass: "small" as const, discoveryTtlSeconds: 60, models: [{ modelId: modelId!, enabled: true, allowed: true, capabilities: { text: true, coding: true, structured_output: false, web: false, tool_calling: false }, contextWindow: 32_768, maxOutputTokens: 4_096, reasoningEfforts: ["none" as const], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 3 as const, latencyTier: 3 as const }] })),
    { id: "openai", type: "openai", enabled: false, freeTierOnly: false, credentialField: "OPENAI_API_KEY", baseUrl: "https://api.openai.com", apiPrefix: "v1/", discoveryTtlSeconds: 3600, models: openAiModels },
    { id: "anthropic", type: "anthropic", enabled: false, freeTierOnly: false, credentialField: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com", apiPrefix: "v1/", discoveryTtlSeconds: 3600, models: [] },
    { id: "openrouter", type: "openai-compatible", enabled: true, freeTierOnly: true, credentialField: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/", apiPrefix: "v1/", discoveryTtlSeconds: 300, models: [{ modelId: "openrouter/free", enabled: true, allowed: true, capabilities: { text: true, vision: true, tool_calling: true, long_context: true, coding: true, structured_output: true }, contextWindow: 131_072, maxOutputTokens: 8_192, reasoningEfforts: ["none", "low", "medium"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 4, latencyTier: 3 }] },
    { id: "gemini", type: "openai-compatible", enabled: true, freeTierOnly: true, credentialField: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", apiPrefix: "", discoveryTtlSeconds: 3600, models: [{ modelId: "gemini-3.7-flash", enabled: true, allowed: true, capabilities: { text: true, vision: true, tool_calling: true, long_context: true, coding: true, structured_output: true }, contextWindow: 1_048_576, maxOutputTokens: 65_536, reasoningEfforts: ["none", "low", "medium", "high"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 4, latencyTier: 2 }] },
    { id: "groq", type: "openai-compatible", enabled: true, freeTierOnly: true, credentialField: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/", apiPrefix: "v1/", discoveryTtlSeconds: 3600, models: [{ modelId: "groq/compound", enabled: true, allowed: true, capabilities: { text: true, tool_calling: true, long_context: true, coding: true, web: true, structured_output: false }, contextWindow: 131_072, maxOutputTokens: 8_192, reasoningEfforts: ["none", "low"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 4, latencyTier: 1 }, { modelId: "openai/gpt-oss-120b", enabled: true, allowed: true, capabilities: { text: true, tool_calling: true, long_context: true, coding: true, structured_output: false }, contextWindow: 131_072, maxOutputTokens: 65_536, reasoningEfforts: ["none", "low", "medium", "high"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 4, latencyTier: 1 }, { modelId: "qwen/qwen3.6-27b", enabled: true, allowed: true, capabilities: { text: true, tool_calling: true, long_context: true, coding: true, structured_output: false }, contextWindow: 131_072, maxOutputTokens: 32_768, reasoningEfforts: ["none", "low", "medium"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 3, latencyTier: 1 }] },
    { id: "custom-openai", type: "openai-compatible", enabled: false, freeTierOnly: false, credentialField: "CUSTOM_OPENAI_API_KEY", baseUrl: "https://example.invalid", apiPrefix: "v1/", discoveryTtlSeconds: 3600, models: [] },
    { id: "ollama", type: "local", enabled: false, freeTierOnly: true, credentialField: null, baseUrl: "http://127.0.0.1:11434", apiPrefix: "v1/", discoveryTtlSeconds: 60, models: [] },
  ],
};

addDefaultFreeLadders(DEFAULT_CONFIG.providers);

export function getRuntimePaths(override?: string): RuntimePaths {
  const localAppData = process.env.LOCALAPPDATA;
  const root = resolve(override ?? process.env.OMNIROUTE_HOME ?? (process.platform === "win32" && localAppData ? join(localAppData, "OmniRoute") : join(homedir(), ".local", "share", "omniroute")));
  return {
    root,
    config: join(root, "config.json"),
    vaultDir: join(root, "vault"),
    vault: join(root, "vault", "vault.json"),
    importDir: join(root, "import"),
    credentialsImport: join(root, "import", "credentials.txt"),
    logsDir: join(root, "logs"),
    log: join(root, "logs", "omniroute.jsonl"),
    routesDir: join(root, "routes"),
    routes: join(root, "routes", "routes.jsonl"),
    backupsDir: join(root, "backups"),
    stateDir: join(root, "state"),
    daemonState: join(root, "state", "daemon.json"),
    integrationsDir: join(root, "integrations"),
  };
}

export async function ensureRuntimeDirectories(paths = getRuntimePaths()): Promise<void> {
  await Promise.all([
    paths.root, paths.vaultDir, paths.importDir, paths.logsDir, paths.routesDir,
    paths.backupsDir, paths.stateDir, paths.integrationsDir,
  ].map((path) => mkdir(path, { recursive: true })));
}

export async function atomicWriteFile(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`);
  await writeFile(temporary, data, { mode: 0o600 });
  const handle = await open(temporary, "r+");
  try { await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeConfig(base: OmniConfig, input: unknown): OmniConfig {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("configuration must be a JSON object");
  const source = input as Partial<OmniConfig>;
  const merged = deepClone(base);
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) throw new Error("unsupported configuration schemaVersion");
  if (source.daemon) Object.assign(merged.daemon, source.daemon);
  if (source.routing) Object.assign(merged.routing, source.routing);
  if (source.budgets) {
    Object.assign(merged.budgets, source.budgets);
    if (source.budgets.taskClassMaximum) Object.assign(merged.budgets.taskClassMaximum, source.budgets.taskClassMaximum);
  }
  if (source.privacy) Object.assign(merged.privacy, source.privacy);
  if (source.reliability) Object.assign(merged.reliability, source.reliability);
  if (source.providers) {
    const incoming = new Map(source.providers.map((provider) => [provider.id, provider]));
    merged.providers = merged.providers.map((provider) => {
      const existing = incoming.get(provider.id);
      const models = existing?.models ? [...existing.models] : [...provider.models];
      if (merged.routing.freeOnly && merged.routing.freeModelFailoverEnabled && existing?.baseUrl === provider.baseUrl) {
        for (const model of provider.models) if (!models.some((item) => item.modelId === model.modelId)) models.push(deepClone(model));
      }
      return { ...provider, ...(existing ?? {}), models };
    });
    for (const provider of source.providers) if (!merged.providers.some((item) => item.id === provider.id)) merged.providers.push({ ...provider, freeTierOnly: provider.freeTierOnly ?? false, credentialField: provider.credentialField ?? null, apiPrefix: provider.apiPrefix ?? "v1/" });
  }
  if (merged.routing.freeOnly) {
    for (const provider of merged.providers) if (!provider.freeTierOnly) provider.enabled = false;
    const provider = merged.providers.find((item) => item.id === merged.routing.orchestratorProviderId);
    const model = provider?.models.find((item) => item.modelId === merged.routing.orchestratorModelId);
    const eligible = provider?.enabled && provider.freeTierOnly && model?.enabled && model.allowed && model.inputPerMillionUsd === 0 && model.outputPerMillionUsd === 0;
    if (!eligible) {
      merged.routing.orchestratorProviderId = base.routing.orchestratorProviderId;
      merged.routing.orchestratorModelId = base.routing.orchestratorModelId;
    }
  }
  validateConfig(merged);
  return merged;
}

export function validateConfig(config: OmniConfig): void {
  if (config.schemaVersion !== 1) throw new Error("configuration schemaVersion must be 1");
  if (config.daemon.host !== "127.0.0.1") throw new Error("daemon must bind to 127.0.0.1");
  if (!Number.isInteger(config.daemon.port) || config.daemon.port < 1024 || config.daemon.port > 65535) throw new Error("daemon port is invalid");
  if (!ROUTING_MODES.includes(config.routing.defaultMode)) throw new Error("default routing mode is invalid");
  if (typeof config.routing.freeModelFailoverEnabled !== "boolean") throw new Error("free model failover setting must be boolean");
  if (typeof config.routing.intentRoutingEnabled !== "boolean") throw new Error("intent routing setting must be boolean");
  if (!Number.isInteger(config.routing.freeModelCooldownMs) || config.routing.freeModelCooldownMs < 1000 || config.routing.freeModelCooldownMs > 86_400_000) throw new Error("free model cooldown must be 1000–86400000 milliseconds");
  if (!config.routing.orchestratorProviderId || !config.routing.orchestratorModelId) throw new Error("orchestrator provider and model are required");
  if (!REASONING_EFFORTS.includes(config.routing.defaultOrchestratorEffort) || !REASONING_EFFORTS.includes(config.routing.ambiguousOrchestratorEffort)) throw new Error("orchestrator reasoning effort is invalid");
  for (const value of [config.routing.maxSubtasks, config.routing.maxParallelWorkers, config.daemon.maxConcurrentRoutes]) if (!Number.isInteger(value) || value < 1 || value > 64) throw new Error("concurrency/fan-out setting is invalid");
  for (const value of [config.budgets.dailyUsd, config.budgets.monthlyUsd, config.budgets.perRequestUsd]) if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("budget values must be non-negative or null");
  const providerIds = new Set<string>();
  for (const provider of config.providers) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(provider.id)) throw new Error(`invalid provider id: ${provider.id}`);
    if (providerIds.has(provider.id)) throw new Error(`duplicate provider id: ${provider.id}`);
    providerIds.add(provider.id);
    if (!["openai", "anthropic", "openai-compatible", "local", "mcp-stdio"].includes(provider.type)) throw new Error(`invalid provider type for ${provider.id}`);
    if (provider.maxTaskClass !== undefined && !TASK_CLASSES.includes(provider.maxTaskClass)) throw new Error(`invalid maximum task class for ${provider.id}`);
    if (provider.type === "mcp-stdio") {
      if (provider.enabled && (!provider.mcpCommand || !Array.isArray(provider.mcpArgs) || provider.mcpArgs.length === 0)) throw new Error(`enabled MCP stdio provider ${provider.id} requires a command and arguments`);
      if ((provider.mcpCommand?.includes("\0") ?? false) || provider.mcpArgs?.some((value) => typeof value !== "string" || value.includes("\0")) || (provider.mcpWorkingDirectory?.includes("\0") ?? false)) throw new Error(`invalid MCP stdio process settings for ${provider.id}`);
    }
    if (provider.freeModelOrder !== undefined && (!Array.isArray(provider.freeModelOrder) || provider.freeModelOrder.some((id) => typeof id !== "string" || !id) || new Set(provider.freeModelOrder).size !== provider.freeModelOrder.length)) throw new Error(`invalid free model order for ${provider.id}`);
    const parsed = new URL(provider.baseUrl);
    if (!isSafeProviderBaseUrl(parsed, provider.type === "local" || provider.type === "mcp-stdio")) throw new Error(`unsafe provider base URL for ${provider.id}`);
    if (provider.apiPrefix && (!/^[A-Za-z0-9._~/-]*$/.test(provider.apiPrefix) || provider.apiPrefix.includes(".."))) throw new Error(`invalid API prefix for ${provider.id}`);
    if (config.routing.freeOnly && provider.enabled && !provider.freeTierOnly) throw new Error(`paid provider ${provider.id} cannot be enabled while free-only policy is active`);
    if (provider.enabled && EXTRA_FREE_PROVIDERS.some((item) => item.id === provider.id) && provider.freeTierConfirmed !== true) throw new Error(`provider ${provider.id} requires explicit free-tier confirmation`);
    if (config.routing.freeOnly && provider.enabled && provider.models.some((model) => model.enabled && (model.inputPerMillionUsd !== 0 || model.outputPerMillionUsd !== 0))) throw new Error(`provider ${provider.id} has a non-free enabled model`);
  }
  if (!providerIds.has(config.routing.orchestratorProviderId)) throw new Error("orchestrator provider is not configured");
  const orchestratorProvider = config.providers.find((provider) => provider.id === config.routing.orchestratorProviderId)!;
  const orchestratorModel = orchestratorProvider.models.find((model) => model.modelId === config.routing.orchestratorModelId);
  if (config.routing.defaultMode === "orchestrator") {
    if (!orchestratorProvider.enabled || !orchestratorModel?.enabled || !orchestratorModel.allowed) throw new Error("orchestrator provider and model must be enabled and allowed");
    if (config.routing.freeOnly && (!orchestratorProvider.freeTierOnly || orchestratorModel.inputPerMillionUsd !== 0 || orchestratorModel.outputPerMillionUsd !== 0)) throw new Error("orchestrator must be zero-priced under free-only policy");
  }
}

export function isSafeProviderBaseUrl(url: URL, allowLoopbackHttp: boolean): boolean {
  if (url.username || url.password || url.hash || url.search) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (url.protocol === "http:") return allowLoopbackHttp && loopback;
  if (url.protocol !== "https:") return false;
  if (loopback) return allowLoopbackHttp;
  if (isIP(host) === 6 && (host === "::" || host.startsWith("::ffff:") || /^(?:fc|fd|fe[89ab]|ff)/.test(host))) return false;
  if (/^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(host)) return false;
  const private172 = /^172\.(\d{1,3})\./.exec(host);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
  if (host === "metadata.google.internal" || host.endsWith(".internal")) return false;
  return true;
}

export async function loadConfig(paths = getRuntimePaths()): Promise<OmniConfig> {
  try {
    await access(paths.config, constants.R_OK);
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(await readFile(paths.config, "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return deepClone(DEFAULT_CONFIG);
    throw error;
  }
}

export async function saveConfig(config: OmniConfig, paths = getRuntimePaths()): Promise<void> {
  validateConfig(config);
  await atomicWriteFile(paths.config, `${JSON.stringify(config, null, 2)}\n`);
}

export function temporaryRuntimeRoot(prefix = "omniroute-test"): string {
  return join(tmpdir(), `${prefix}-${process.pid}-${Math.random().toString(16).slice(2)}`);
}
