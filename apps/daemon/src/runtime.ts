import type { OmniConfig, RuntimePaths } from "@omniroute/config";
import { ensureRuntimeDirectories, getRuntimePaths, loadConfig } from "@omniroute/config";
import type { RegistrySnapshot } from "@omniroute/contracts";
import { OmniRouter } from "@omniroute/core";
import { AuditStore, JsonlLogger } from "@omniroute/observability";
import { buildRegistry, createProviders, type FetchLike, type ProviderAdapter } from "@omniroute/providers";
import { ensureLocalDaemonToken, SecretVault, type KeyProtector } from "@omniroute/vault";

export interface DaemonRuntime {
  config: OmniConfig;
  paths: RuntimePaths;
  token: string;
  providers: Map<string, ProviderAdapter>;
  registry: RegistryManager;
  audit: AuditStore;
  logger: JsonlLogger;
  router: OmniRouter;
}

export class RegistryManager {
  #cached: RegistrySnapshot | null = null;
  #loadedAt = 0;

  constructor(
    private readonly config: OmniConfig,
    private readonly providers: Map<string, ProviderAdapter>,
  ) {}

  async current(force = false, signal?: AbortSignal): Promise<RegistrySnapshot> {
    const ttl = this.config.routing.modelHealthTtlSeconds * 1000;
    if (!force && this.#cached && Date.now() - this.#loadedAt < ttl) return this.#cached;
    this.#cached = await buildRegistry(this.config, this.providers, signal);
    this.#loadedAt = Date.now();
    return this.#cached;
  }
}

export async function createDaemonRuntime(options: {
  paths?: RuntimePaths;
  protector?: KeyProtector;
  fetchImpl?: FetchLike;
  skipDnsValidationForTests?: boolean;
} = {}): Promise<DaemonRuntime> {
  const paths = options.paths ?? getRuntimePaths();
  await ensureRuntimeDirectories(paths);
  const config = await loadConfig(paths);
  const token = await ensureLocalDaemonToken(paths, options.protector);
  const vault = await SecretVault.load(paths.vault, options.protector);
  const credentials: Record<string, Record<string, string>[]> = {};
  try {
    for (const provider of config.providers) {
      const records = vault.getCredentialSlots(provider.id).map((item) => item.values);
      if (records.length) credentials[provider.id] = records;
    }
    for (const wellKnown of ["openai", "anthropic", "openrouter", "custom-openai", "azure-openai"]) {
      const records = vault.getCredentialSlots(wellKnown).map((item) => item.values);
      if (records.length) credentials[wellKnown] = records;
    }
  } finally { vault.dispose(); }
  const providers = createProviders(config, { credentials, fetchImpl: options.fetchImpl, skipDnsValidationForTests: options.skipDnsValidationForTests });
  for (const slots of Object.values(credentials)) for (const values of slots) for (const field of Object.keys(values)) values[field] = "";
  const registry = new RegistryManager(config, providers);
  const audit = new AuditStore(paths.routes);
  const logger = new JsonlLogger(paths.log);
  const router = new OmniRouter({ config, providers, registry: () => registry.current(), audit, logger });
  return { config, paths, token, providers, registry, audit, logger, router };
}
