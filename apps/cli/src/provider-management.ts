import { EXTRA_FREE_PROVIDERS, freeWorkerModel, validateConfig, type OmniConfig } from "@omniroute/config";
import { SafeError } from "@omniroute/observability";

export function configureProvider(config: OmniConfig, id: string, options: { enabled: boolean; confirmFreeTier?: boolean; modelId?: string | null; contextTokens?: number; coding?: boolean }): void {
  const provider = config.providers.find((item) => item.id === id);
  if (!provider) throw new SafeError("PROVIDER_UNKNOWN", `Unknown provider: ${id}`, 400);
  if (options.enabled) {
    if (!provider.freeTierOnly) throw new SafeError("PAID_PROVIDER_DISABLED", "This command only enables free provider profiles", 400);
    const profile = EXTRA_FREE_PROVIDERS.find((item) => item.id === id);
    if (profile && !options.confirmFreeTier && !provider.freeTierConfirmed) throw new SafeError("FREE_TIER_CONFIRMATION_REQUIRED", `${profile.note} After checking the provider dashboard, rerun with --confirm-free-tier. This confirms free-only billing and applicable use terms; OmniRoute cannot inspect billing settings.`, 400);
    if (profile && options.confirmFreeTier) provider.freeTierConfirmed = true;
    if (provider.type === "local" && options.modelId) {
      const context = options.contextTokens;
      if (!context || !Number.isInteger(context) || context < 8192 || context > 2_000_000) throw new SafeError("CONTEXT_REQUIRED", "Specify --context-tokens matching the local server's loaded context (8192–2000000)", 400);
      const model = freeWorkerModel(options.modelId, context, options.coding === true);
      provider.models = [...provider.models.filter((item) => item.modelId !== options.modelId), model];
    }
    if (!provider.models.some((item) => item.enabled && item.allowed)) throw new SafeError("MODEL_REQUIRED", "Configure an explicit local model using --model ID --context-tokens N [--coding]", 400);
    if (!config.routing.directProviderOrder.includes(id)) config.routing.directProviderOrder.push(id);
  }
  provider.enabled = options.enabled;
  if (!options.enabled && EXTRA_FREE_PROVIDERS.some((item) => item.id === id)) provider.freeTierConfirmed = false;
  validateConfig(config);
}
