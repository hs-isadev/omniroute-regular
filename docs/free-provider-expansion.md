# Free provider/authentication guide — reviewed 2026-08-31

**Published Dual v0.3.0 exposes 10 eligible providers; unreleased v0.4.0 source exposes 12 by adding Cerebras and SambaNova.** Hugging Face/Vercel credit-based profiles remain disabled. Their existing stored keys are retained but are not used by Regular. No provider activates merely by installing: add/reuse your own key and confirm applicable free-plan/evaluation terms. The graphical key form shows signup links and saved-provider status without exporting saved keys.

Free access is conditional and quota-limited. [Gemini billing](https://ai.google.dev/gemini-api/docs/billing) distinguishes free projects from billing-enabled paid tiers. [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) limits the free plan and requires paid access for some newer models (not included in this package's allowlist). [Cohere](https://docs.cohere.com/docs/rate-limits) distinguishes evaluation and production keys. [Kilo Auto Free](https://kilo.ai/docs/getting-started/rate-limits-and-costs), [Z.AI Flash](https://docs.z.ai/guides/overview/pricing) and [Zen's temporary free list](https://opencode.ai/docs/zen/) are model-specific offers, not permission to use every model. Do not enable billing to pass validation. No API probe can universally prove that your provider account cannot bill.

| Addition | Get a key | Free access and restrictions |
|---|---|---|
| Cerebras | [Cloud console](https://cloud.cerebras.ai/) | Official rate-limit documentation describes a quota-limited free tier. This profile allows only `gpt-oss-120b`, `qwen-3-235b-a22b-instruct-2507`, and `zai-glm-4.7`; it does not enable pay-as-you-go. Availability and limits can change. [Rate limits](https://inference-docs.cerebras.ai/support/rate-limits). |
| SambaNova | [API console](https://cloud.sambanova.ai/apis) | Official documentation describes a Free Tier for accounts without a payment method. This profile allows only `gpt-oss-120b`; it does not add a payment method or enable developer billing. [Rate limits](https://docs.sambanova.ai/cloud/docs/get-started/rate-limits). |
| Kilo Gateway | [Personal profile](https://app.kilo.ai/) → Your Profile → API key at bottom | Only `kilo-auto/free` and `openrouter/free`. No purchased credits needed. This editor uses your own API key; the upstream gateway also documents anonymous free access. Free routing can use evaluation endpoints that log prompts. No confidential data. [Models and terms](https://kilo.ai/docs/gateway/models-and-providers), [key instructions](https://kilo.ai/docs/getting-started/setup-authentication). |
| Z.AI | [API keys](https://z.ai/manage-apikey/apikey-list) | Only `glm-4.7-flash` and `glm-4.5-flash`, listed at zero input/output price. **FlashX is not free.** Paid search tools are excluded. [Pricing](https://docs.z.ai/guides/overview/pricing). |
| NVIDIA | [Build catalog](https://build.nvidia.com/) → model → Get API key | Free Developer Program hosted endpoints for development, testing, research and evaluation, not production serving. Account verification and limits apply; no personal/confidential prompts. The profile uses Nemotron 3 Super 120B. [Developer FAQ](https://docs.api.nvidia.com/nim/docs/product). |
| Vercel AI Gateway | [Gateway dashboard](https://vercel.com/ai-gateway) → API keys | $5 included monthly on eligible free-tier accounts, not unlimited free model pricing. Buying credits ends the monthly free tier. No purchased balance, paid BYOK or auto top-up. [Pricing](https://vercel.com/docs/ai-gateway/pricing). |
| OpenCode Zen | [Sign in](https://opencode.ai/auth) → API key | Big Pickle, MiMo-V2.5 Free and Nemotron 3 Ultra Free only. Temporary free availability; free-period data can improve models. Do not add billing just to use this integration; stop if your account requires payment. Disable auto-reload. This is a provider, not another installed harness. [Free models and billing](https://opencode.ai/docs/zen/). |

All additions are opt-in workers. The v0.2 portable launcher is Antigravity plus local MCP, regular-only; **OpenRouter is no longer required**. The separate existing orchestrator setup is preserved. Antigravity host quota remains independent of worker quotas.

## All credential entry points

| Provider | Official key/token page | Access category |
|---|---|---|
| Groq | [Console keys](https://console.groq.com/keys) | Account free tier, quota-limited |
| Gemini | [AI Studio](https://aistudio.google.com/apikey) | Eligible-region/account free tier; do not enable paid billing |
| OpenRouter | [Keys](https://openrouter.ai/settings/keys) | Explicit free model endpoints, shared account limits |
| Mistral | [Studio keys](https://console.mistral.ai/api-keys/) | Free Studio evaluation/prototyping plan, not Scale |
| Cohere | [Dashboard keys](https://dashboard.cohere.com/api-keys) | Trial/evaluation restrictions, not production entitlement |
| Cloudflare | [Dashboard](https://dash.cloudflare.com/) | Workers AI free allocation; service token plus account ID |
| Hugging Face | [Access tokens](https://huggingface.co/settings/tokens) | Inference permission, small recurring credit; no paid balance/BYOK |

The five remaining providers and conditions are in the table above. No browser passwords or consumer login tokens are accepted. Model prices/terms may change; the configured zero-price allowlist is not an account-billing guarantee.

## Additional coding candidates in Regular v0.2

- [NVIDIA Kimi K2.6](https://build.nvidia.com/moonshotai/kimi-k2.6?nim=hosted): official hosted free evaluation candidate, exact ID `moonshotai/kimi-k2.6`. Adapter uses text completion; multimodal support is not enabled. Context is capped at 262,144, output at 4,096. NVIDIA restrictions above apply.
- [OpenRouter Qwen3 Coder free](https://openrouter.ai/qwen/qwen3-coder:free): exact ID `qwen/qwen3-coder:free`, conservative 131,072 context / 4,096 output caps. Never substitute its paid sibling. Upstream supports coding/tool use; this worker path requests only text.
- [OpenCode Zen](https://opencode.ai/docs/zen/): the existing Big Pickle, MiMo-V2.5 Free and Nemotron 3 Ultra Free profiles remain independent of the removed OpenCode harness. Promotional availability and privacy terms must be rechecked.

Kimi/Qwen start disabled. Tick the extra candidate check in Settings and supply that provider's key to attempt a bounded completion; only a responding candidate is activated. That proves connectivity, not executable code correctness, reliable streaming on your account, or a frontier-quality ranking. No live comparative benchmark is claimed. Model ladders are provisional. Third-party gateways can share upstream capacity.

## Not added

- **GitHub Models:** fully retired July 30, 2026, including inference API. Old free-API lists are stale. [Official retirement notice](https://docs.github.com/en/github-models).
- **SiliconFlow:** official quickstart supports an international OpenAI-compatible endpoint, but the accessible pricing example lists older models and directs users to their account for current prices. Not included until current zero-price model availability is verified; signup credit alone is insufficient. [Pricing example](https://docs.siliconflow.com/en/faqs/billing-rules), [quickstart](https://docs.siliconflow.com/en/userguide/quickstart).
- Paid-only services, one-off credit offers requiring payment, consumer login/session scraping and subscription workarounds are excluded.

## Your existing setup

Use the **OmniRoute Provider Keys** desktop shortcut. Scroll to the new provider rows, paste your own keys and select Validate and save. Existing keys are never displayed; blank fields preserve them. Existing routing mode, port, and disabled providers are preserved. Successfully validated new providers are added to the routing order. Saving accepted keys restarts the existing OmniRoute background service; finish active requests first. If automatic restart fails, the form says so and gives manual commands.

Keys are sent via process stdin and stored in your existing DPAPI vault; they are not copied into this repository, the ZIP, or shell arguments. No provider's billing settings are changed. Local free-only configuration cannot verify your provider account's billing status.

## Verification boundaries

Provider adapters have mock-backed discovery, completion, streaming and credential tests. A successful public/no-key endpoint probe is not proof that a newly created personal API key will work. Each supplied key is tested locally before activation, trying up to three configured free models. New providers without supplied keys remain unconfigured, not falsely marked healthy.
