import type { ProviderSettings } from "./index.js";

export interface FreeProviderProfile {
  id: string;
  credentialField: string;
  credentialFields?: string[];
  access: "free-models" | "free-tier" | "monthly-credit" | "evaluation";
  signup: string;
  note: string;
  baseUrl: string;
  apiPrefix: string;
  modelIds: string[];
}

// These are opt-in profiles, not assertions about a user's billing account.
// No trial-credit-only or paid-model fallback is automatically activated.
export const EXTRA_FREE_PROVIDERS: FreeProviderProfile[] = [
  { id: "kilo", credentialField: "KILO_API_KEY", credentialFields: ["KILO_API_KEY_1","KILO_API_KEY_2","KILO_API_KEY_3","KILO_API_KEY_4","KILO_API_KEY_5"], access: "free-models", signup: "https://kilo.ai/docs/gateway/authentication", note: "Only kilo-auto/free and openrouter/free. No paid balance or BYOK. Free routing may use evaluation endpoints that log prompts; public/non-confidential development tasks only.", baseUrl: "https://api.kilo.ai/", apiPrefix: "api/gateway/", modelIds: ["kilo-auto/free", "openrouter/free"] },
  { id: "mistral", credentialField: "MISTRAL_API_KEY", credentialFields: ["MISTRAL_API_KEY_1","MISTRAL_API_KEY_2","MISTRAL_API_KEY_3","MISTRAL_API_KEY_4","MISTRAL_API_KEY_5"], access: "free-tier", signup: "https://console.mistral.ai/api-keys/", note: "Use Studio Free mode, not a paid Scale workspace. Evaluation/prototyping quotas apply.", baseUrl: "https://api.mistral.ai/", apiPrefix: "v1/", modelIds: ["mistral-small-2603", "ministral-8b-2512"] },
  { id: "cerebras", credentialField: "CEREBRAS_API_KEY", credentialFields: ["CEREBRAS_API_KEY_1","CEREBRAS_API_KEY_2","CEREBRAS_API_KEY_3","CEREBRAS_API_KEY_4","CEREBRAS_API_KEY_5"], access: "free-tier", signup: "https://cloud.cerebras.ai/", note: "Free inference tier only. Do not enable pay-as-you-go. Current free quotas and model availability can change; setup validates before activation.", baseUrl: "https://api.cerebras.ai/", apiPrefix: "v1/", modelIds: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507", "zai-glm-4.7"] },
  { id: "sambanova", credentialField: "SAMBANOVA_API_KEY", credentialFields: ["SAMBANOVA_API_KEY_1","SAMBANOVA_API_KEY_2","SAMBANOVA_API_KEY_3","SAMBANOVA_API_KEY_4","SAMBANOVA_API_KEY_5"], access: "free-tier", signup: "https://cloud.sambanova.ai/apis", note: "SambaCloud Free Tier only, which applies when no payment method is linked. Setup does not enable Developer Tier or billing.", baseUrl: "https://api.sambanova.ai/", apiPrefix: "v1/", modelIds: ["gpt-oss-120b"] },
  { id: "cohere", credentialField: "COHERE_API_KEY", credentialFields: ["COHERE_API_KEY_1","COHERE_API_KEY_2","COHERE_API_KEY_3","COHERE_API_KEY_4","COHERE_API_KEY_5"], access: "evaluation", signup: "https://dashboard.cohere.com/api-keys", note: "Use a trial/evaluation key; observe evaluation-use restrictions and monthly limits.", baseUrl: "https://api.cohere.ai/", apiPrefix: "compatibility/v1/", modelIds: ["command-a-plus-05-2026", "command-r7b-12-2024"] },
  { id: "cloudflare", credentialField: "CLOUDFLARE_API_TOKEN", credentialFields: ["CLOUDFLARE_API_TOKEN_1","CLOUDFLARE_API_TOKEN_2","CLOUDFLARE_API_TOKEN_3","CLOUDFLARE_API_TOKEN_4","CLOUDFLARE_API_TOKEN_5"], access: "free-tier", signup: "https://dash.cloudflare.com/", note: "Workers AI Free plan only. Also import CLOUDFLARE_ACCOUNT_ID; token needs Workers AI Read permission. Do not upgrade to paid overages.", baseUrl: "https://api.cloudflare.com/", apiPrefix: "client/v4/", modelIds: ["@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-4.7-flash"] },
  { id: "huggingface", credentialField: "HF_TOKEN", credentialFields: ["HF_TOKEN_1","HF_TOKEN_2","HF_TOKEN_3","HF_TOKEN_4","HF_TOKEN_5"], access: "monthly-credit", signup: "https://huggingface.co/settings/tokens", note: "Small monthly Inference Providers credit; token needs inference permission. No purchased balance, billing, or custom paid provider keys.", baseUrl: "https://router.huggingface.co/", apiPrefix: "v1/", modelIds: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  { id: "vercel", credentialField: "VERCEL_AI_GATEWAY_API_KEY", credentialFields: ["VERCEL_AI_GATEWAY_API_KEY_1","VERCEL_AI_GATEWAY_API_KEY_2","VERCEL_AI_GATEWAY_API_KEY_3","VERCEL_AI_GATEWAY_API_KEY_4","VERCEL_AI_GATEWAY_API_KEY_5"], access: "monthly-credit", signup: "https://vercel.com/ai-gateway", note: "Free AI Gateway monthly credits only. Purchasing credits ends the free tier. No paid balance, BYOK, or auto top-up.", baseUrl: "https://ai-gateway.vercel.sh/", apiPrefix: "v1/", modelIds: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  { id: "nvidia", credentialField: "NVIDIA_API_KEY", credentialFields: ["NVIDIA_API_KEY_1","NVIDIA_API_KEY_2","NVIDIA_API_KEY_3","NVIDIA_API_KEY_4","NVIDIA_API_KEY_5"], access: "evaluation", signup: "https://build.nvidia.com/", note: "Hosted free evaluation endpoint, subject to limits and terms; do not send personal/confidential data.", baseUrl: "https://integrate.api.nvidia.com/", apiPrefix: "v1/", modelIds: ["nvidia/nemotron-3-super-120b-a12b"] },
  { id: "zai", credentialField: "ZAI_API_KEY", credentialFields: ["ZAI_API_KEY_1","ZAI_API_KEY_2","ZAI_API_KEY_3","ZAI_API_KEY_4","ZAI_API_KEY_5"], access: "free-models", signup: "https://z.ai/manage-apikey/apikey-list", note: "Only the listed zero-price Flash models. No paid search tools or coding-plan credential substitution.", baseUrl: "https://api.z.ai/", apiPrefix: "api/paas/v4/", modelIds: ["glm-4.7-flash", "glm-4.5-flash"] },
  { id: "opencode-zen", credentialField: "OPENCODE_ZEN_API_KEY", credentialFields: ["OPENCODE_ZEN_API_KEY_1","OPENCODE_ZEN_API_KEY_2","OPENCODE_ZEN_API_KEY_3","OPENCODE_ZEN_API_KEY_4","OPENCODE_ZEN_API_KEY_5"], access: "free-models", signup: "https://opencode.ai/auth", note: "Temporary free models only. Disable auto-reload; do not add payment details or paid balance. Free-period data may improve models. Separate from the OpenCode harness.", baseUrl: "https://opencode.ai/", apiPrefix: "zen/v1/", modelIds: ["big-pickle", "mimo-v2.5-free", "nemotron-3-ultra-free"] },
  { id: "together", credentialField: "TOGETHER_API_KEY", credentialFields: ["TOGETHER_API_KEY_1","TOGETHER_API_KEY_2","TOGETHER_API_KEY_3","TOGETHER_API_KEY_4","TOGETHER_API_KEY_5"], access: "free-tier", signup: "https://api.together.xyz/settings/api-keys", note: "Free inference tier. No paid balance, BYOK or auto top-up. Model availability can change; setup validates before activation.", baseUrl: "https://api.together.xyz/", apiPrefix: "v1/", modelIds: ["meta-llama/Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.2", "google/gemma-2-9b-it"] },
  { id: "fireworks", credentialField: "FIREWORKS_API_KEY", credentialFields: ["FIREWORKS_API_KEY_1","FIREWORKS_API_KEY_2","FIREWORKS_API_KEY_3","FIREWORKS_API_KEY_4","FIREWORKS_API_KEY_5"], access: "free-tier", signup: "https://fireworks.ai/settings/api-keys", note: "Free inference tier only. Do not enable paid plans. Free model availability changes; setup validates first.", baseUrl: "https://api.fireworks.ai/inference/v1/", apiPrefix: "v1/", modelIds: ["accounts/fireworks/models/llama-v3-70b-instruct", "accounts/fireworks/models/mixtral-8x7b-instruct"] },
  { id: "novita", credentialField: "NOVITA_API_KEY", credentialFields: ["NOVITA_API_KEY_1","NOVITA_API_KEY_2","NOVITA_API_KEY_3","NOVITA_API_KEY_4","NOVITA_API_KEY_5"], access: "free-tier", signup: "https://console.novita.ai/playground/apiKeys", note: "Free monthly credits. No paid balance, BYOK or auto top-up. Model availability changes.", baseUrl: "https://api.novita.ai/v3/", apiPrefix: "v1/", modelIds: ["meta-llama/Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.2"] },
  { id: "lepton", credentialField: "LEPTON_API_KEY", credentialFields: ["LEPTON_API_KEY_1","LEPTON_API_KEY_2","LEPTON_API_KEY_3","LEPTON_API_KEY_4","LEPTON_API_KEY_5"], access: "free-tier", signup: "https://www.lepton.ai/settings/api-keys", note: "Free inference tier. No paid balance, BYOK or auto top-up. Model availability changes.", baseUrl: "https://api.lepton.ai/", apiPrefix: "v1/", modelIds: ["meta-llama/Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.2"] },
  { id: "replicate", credentialField: "REPLICATE_API_TOKEN", credentialFields: ["REPLICATE_API_TOKEN_1","REPLICATE_API_TOKEN_2","REPLICATE_API_TOKEN_3","REPLICATE_API_TOKEN_4","REPLICATE_API_TOKEN_5"], access: "free-tier", signup: "https://replicate.com/account/api-tokens", note: "Free tier for select models. No paid balance, BYOK or auto top-up. Many models are paid; only free ones route.", baseUrl: "https://api.replicate.com/v1/", apiPrefix: "v1/", modelIds: ["meta/llama-3.1-8b-instruct", "mistralai/mistral-7b-instruct-v0.2"] },
  { id: "perplexity", credentialField: "PERPLEXITY_API_KEY", credentialFields: ["PERPLEXITY_API_KEY_1","PERPLEXITY_API_KEY_2","PERPLEXITY_API_KEY_3","PERPLEXITY_API_KEY_4","PERPLEXITY_API_KEY_5"], access: "free-tier", signup: "https://www.perplexity.ai/settings/api", note: "Free tier with generous limits. No paid balance, BYOK or auto top-up.", baseUrl: "https://api.perplexity.ai/", apiPrefix: "v1/", modelIds: ["sonar-small", "sonar-large"] },
  { id: "deepinfra", credentialField: "DEEPINFRA_API_TOKEN", credentialFields: ["DEEPINFRA_API_TOKEN_1","DEEPINFRA_API_TOKEN_2","DEEPINFRA_API_TOKEN_3","DEEPINFRA_API_TOKEN_4","DEEPINFRA_API_TOKEN_5"], access: "free-tier", signup: "https://deepinfra.com/dashboard/settings", note: "Free inference tier with rate limits. No paid balance, BYOK or auto top-up.", baseUrl: "https://api.deepinfra.com/", apiPrefix: "v1/", modelIds: ["meta-llama/Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.2"] },
  { id: "9router", credentialField: "9ROUTER_API_KEY", credentialFields: ["9ROUTER_API_KEY_1","9ROUTER_API_KEY_2","9ROUTER_API_KEY_3","9ROUTER_API_KEY_4","9ROUTER_API_KEY_5"], access: "free-models", signup: "https://9router.io", note: "Route aggregator. Use free-tier or free-models access. No paid balance, BYOK or auto top-up.", baseUrl: "https://api.9router.io/", apiPrefix: "v1/", modelIds: ["openrouter/free", "openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
];

// Normalize legacy profile declarations so catalog consumers and generated
// configs both expose the canonical field plus five independent slots.
for (const profile of EXTRA_FREE_PROVIDERS) {
  profile.credentialFields = [profile.credentialField, ...(profile.credentialFields ?? []).filter((field) => field !== profile.credentialField)];
}

export function freeWorkerModel(modelId: string, contextWindow = 32_768, coding = true): ProviderSettings["models"][number] {
  return { modelId, enabled: true, allowed: true, capabilities: { text: true, coding, structured_output: false, web: false }, contextWindow, maxOutputTokens: 4_096, reasoningEfforts: ["none"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 3, latencyTier: 3 };
}

export function extraProviderSettings(): ProviderSettings[] {
  return [
    ...EXTRA_FREE_PROVIDERS.map((profile): ProviderSettings => ({
      id: profile.id, type: "openai-compatible", enabled: false, freeTierOnly: true, freeTierConfirmed: false,
      credentialField: profile.credentialField,
      // Keep the canonical field plus five numbered alternates. Older catalog
      // entries stored only the alternates, so normalize them here for every
      // generated config and installer surface.
      credentialFields: [profile.credentialField, ...(profile.credentialFields ?? []).filter((field) => field !== profile.credentialField)],
      baseUrl: profile.baseUrl, apiPrefix: profile.apiPrefix,
      freeModelOrder: [...profile.modelIds], discoveryTtlSeconds: 3600, models: profile.modelIds.map((id, index) => ({ ...freeWorkerModel(id), intelligenceTier: index === 0 ? 4 : 2, maxOutputTokens: id === "command-r7b-12-2024" ? 4000 : 4096 })),
    })),
    ...[{ id: "lmstudio", port: 1234 }, { id: "llamacpp", port: 8080 }].map(({ id, port }): ProviderSettings => ({
      id, type: "local", enabled: false, freeTierOnly: true, credentialField: null, credentialFields: null,
      baseUrl: `http://127.0.0.1:${port}/`, apiPrefix: "v1/", discoveryTtlSeconds: 60, models: [],
    })),
  ];
}

export function addDefaultFreeLadders(providers: ProviderSettings[]): void {
  const add = (id: string, model: ProviderSettings["models"][number]): void => { providers.find((item) => item.id === id)!.models.push(model); };
  const textModel = (id: string, tier: 2 | 4): ProviderSettings["models"][number] => ({ ...freeWorkerModel(id, 131_072), intelligenceTier: tier, capabilities: { text: true, coding: true, tool_calling: true, structured_output: false, web: false } });
  add("groq", textModel("openai/gpt-oss-20b", 2));
  const compound = providers.find((item) => item.id === "groq")!.models.find((item) => item.modelId === "groq/compound")!;
  add("groq", { ...compound, modelId: "groq/compound-mini", intelligenceTier: 2 });
  const flash = providers.find((item) => item.id === "gemini")!.models[0]!;
  add("gemini", { ...flash, modelId: "gemini-3.1-flash-lite", intelligenceTier: 2, maxOutputTokens: 8192 });
  for (const [id, tier] of [["openai/gpt-oss-120b:free", 4], ["openai/gpt-oss-20b:free", 2]] as const) add("openrouter", textModel(id, tier));
  const orders: Record<string, string[]> = {
    groq: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b", "groq/compound", "groq/compound-mini"],
    gemini: ["gemini-3.7-flash", "gemini-3.1-flash-lite"],
    openrouter: ["openai/gpt-oss-120b:free", "openai/gpt-oss-20b:free", "openrouter/free"],
  };
  for (const [id, order] of Object.entries(orders)) providers.find((item) => item.id === id)!.freeModelOrder = order;
}
