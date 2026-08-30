import type { ProviderSettings } from "./index.js";

export interface FreeProviderProfile {
  id: string;
  credentialField: string;
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
  { id: "mistral", credentialField: "MISTRAL_API_KEY", access: "free-tier", signup: "https://console.mistral.ai/api-keys/", note: "Use Studio Free mode, not a paid Scale workspace. Evaluation/prototyping quotas apply.", baseUrl: "https://api.mistral.ai/", apiPrefix: "v1/", modelIds: ["mistral-small-2603", "ministral-8b-2512"] },
  { id: "cohere", credentialField: "COHERE_API_KEY", access: "evaluation", signup: "https://dashboard.cohere.com/api-keys", note: "Use a trial/evaluation key; observe evaluation-use restrictions and monthly limits.", baseUrl: "https://api.cohere.ai/", apiPrefix: "compatibility/v1/", modelIds: ["command-a-plus-05-2026", "command-r7b-12-2024"] },
  { id: "cloudflare", credentialField: "CLOUDFLARE_API_TOKEN", access: "free-tier", signup: "https://dash.cloudflare.com/", note: "Workers AI Free plan only. Also import CLOUDFLARE_ACCOUNT_ID; token needs Workers AI Read permission. Do not upgrade to paid overages.", baseUrl: "https://api.cloudflare.com/", apiPrefix: "client/v4/", modelIds: ["@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-4.7-flash"] },
  { id: "huggingface", credentialField: "HF_TOKEN", access: "monthly-credit", signup: "https://huggingface.co/settings/tokens", note: "Small monthly Inference Providers credit; token needs inference permission. No purchased balance, billing, or custom paid provider keys.", baseUrl: "https://router.huggingface.co/", apiPrefix: "v1/", modelIds: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  { id: "vercel", credentialField: "VERCEL_AI_GATEWAY_API_KEY", access: "monthly-credit", signup: "https://vercel.com/ai-gateway", note: "Free AI Gateway monthly credits only. Purchasing credits ends the free tier. No paid balance, BYOK, or auto top-up.", baseUrl: "https://ai-gateway.vercel.sh/", apiPrefix: "v1/", modelIds: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  { id: "nvidia", credentialField: "NVIDIA_API_KEY", access: "evaluation", signup: "https://build.nvidia.com/", note: "Hosted free evaluation endpoint, subject to limits and terms; do not send personal/confidential data.", baseUrl: "https://integrate.api.nvidia.com/", apiPrefix: "v1/", modelIds: ["nvidia/nemotron-3-super-120b-a12b"] },
  { id: "zai", credentialField: "ZAI_API_KEY", access: "free-models", signup: "https://z.ai/manage-apikey/apikey-list", note: "Only the listed zero-price Flash models. No paid search tools or coding-plan credential substitution.", baseUrl: "https://api.z.ai/", apiPrefix: "api/paas/v4/", modelIds: ["glm-4.7-flash", "glm-4.5-flash"] },
  { id: "opencode-zen", credentialField: "OPENCODE_ZEN_API_KEY", access: "free-models", signup: "https://opencode.ai/auth", note: "Temporary free models only. Disable auto-reload; do not add payment details or paid balance. Free-period data may improve models. Separate from the OpenCode harness.", baseUrl: "https://opencode.ai/", apiPrefix: "zen/v1/", modelIds: ["big-pickle", "mimo-v2.5-free", "nemotron-3-ultra-free"] },
];

export function freeWorkerModel(modelId: string, contextWindow = 32_768, coding = true): ProviderSettings["models"][number] {
  return { modelId, enabled: true, allowed: true, capabilities: { text: true, coding, structured_output: false, web: false }, contextWindow, maxOutputTokens: 4_096, reasoningEfforts: ["none"], inputPerMillionUsd: 0, outputPerMillionUsd: 0, intelligenceTier: 3, latencyTier: 3 };
}

export function extraProviderSettings(): ProviderSettings[] {
  return [
    ...EXTRA_FREE_PROVIDERS.map((profile): ProviderSettings => ({
      id: profile.id, type: "openai-compatible", enabled: false, freeTierOnly: true, freeTierConfirmed: false,
      credentialField: profile.credentialField, baseUrl: profile.baseUrl, apiPrefix: profile.apiPrefix,
      freeModelOrder: [...profile.modelIds], discoveryTtlSeconds: 3600, models: profile.modelIds.map((id, index) => ({ ...freeWorkerModel(id), intelligenceTier: index === 0 ? 4 : 2, maxOutputTokens: id === "command-r7b-12-2024" ? 4000 : 4096 })),
    })),
    ...[{ id: "lmstudio", port: 1234 }, { id: "llamacpp", port: 8080 }].map(({ id, port }): ProviderSettings => ({
      id, type: "local", enabled: false, freeTierOnly: true, credentialField: null,
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
