# Free provider expansion — checked 2026-08-30

The masked key editor now exposes **12 providers**: the original seven plus Kilo, Z.AI, NVIDIA, Vercel and OpenCode Zen. Four of these already had opt-in backend profiles; this update exposes them in the portable installer and adds an existing-installation key editor. Kilo is a new backend integration. They are not activated merely by installing the update: add your own key and confirm the applicable free-tier terms first.

| Addition | Get a key | Free access and restrictions |
|---|---|---|
| Kilo Gateway | [Personal profile](https://app.kilo.ai/) → Your Profile → API key at bottom | Only `kilo-auto/free` and `openrouter/free`. No purchased credits needed. This editor uses your own API key; the upstream gateway also documents anonymous free access. Free routing can use evaluation endpoints that log prompts. No confidential data. [Models and terms](https://kilo.ai/docs/gateway/models-and-providers), [key instructions](https://kilo.ai/docs/getting-started/setup-authentication). |
| Z.AI | [API keys](https://z.ai/manage-apikey/apikey-list) | Only `glm-4.7-flash` and `glm-4.5-flash`, listed at zero input/output price. **FlashX is not free.** Paid search tools are excluded. [Pricing](https://docs.z.ai/guides/overview/pricing). |
| NVIDIA | [Build catalog](https://build.nvidia.com/) → model → Get API key | Free Developer Program hosted endpoints for development, testing, research and evaluation, not production serving. Account verification and limits apply; no personal/confidential prompts. The profile uses Nemotron 3 Super 120B. [Developer FAQ](https://docs.api.nvidia.com/nim/docs/product). |
| Vercel AI Gateway | [Gateway dashboard](https://vercel.com/ai-gateway) → API keys | $5 included monthly on eligible free-tier accounts, not unlimited free model pricing. Buying credits ends the monthly free tier. No purchased balance, paid BYOK or auto top-up. [Pricing](https://vercel.com/docs/ai-gateway/pricing). |
| OpenCode Zen | [Sign in](https://opencode.ai/auth) → API key | Big Pickle, MiMo-V2.5 Free and Nemotron 3 Ultra Free only. Temporary free availability; free-period data can improve models. Do not add billing just to use this integration; stop if your account requires payment. Disable auto-reload. This is a provider, not another installed harness. [Free models and billing](https://opencode.ai/docs/zen/). |

All additions are available as workers in either mode of an existing OmniRoute installation, once enabled and validated. The brother's portable launcher remains regular-only. Its **OpenCode host still uses OpenRouter**: extra worker providers do not automatically replace the host if OpenRouter's quota runs out.

## Not added

- **GitHub Models:** fully retired July 30, 2026, including inference API. Old free-API lists are stale. [Official retirement notice](https://docs.github.com/en/github-models).
- **Cerebras:** current documentation says $5 trial credits, expiring after 30 days, and a verified payment method required. No renewing free tier. Older search snippets still advertise an obsolete free allowance. [Current limits/FAQ](https://inference-docs.cerebras.ai/support/rate-limits).
- **SiliconFlow:** official quickstart supports an international OpenAI-compatible endpoint, but the accessible pricing example lists older models and directs users to their account for current prices. Not included until current zero-price model availability is verified; signup credit alone is insufficient. [Pricing example](https://docs.siliconflow.com/en/faqs/billing-rules), [quickstart](https://docs.siliconflow.com/en/userguide/quickstart).
- Paid-only services, one-off credit offers requiring payment, consumer login/session scraping and subscription workarounds are excluded.

## Your existing setup

Use the **OmniRoute Provider Keys** desktop shortcut. Scroll to the new provider rows, paste your own keys and select Validate and save. Existing keys are never displayed; blank fields preserve them. Existing routing mode, port, and disabled providers are preserved. Successfully validated new providers are added to the routing order. Saving accepted keys restarts the existing OmniRoute background service; finish active requests first. If automatic restart fails, the form says so and gives manual commands.

Keys are sent via process stdin and stored in your existing DPAPI vault; they are not copied into this repository, the ZIP, or shell arguments. No provider's billing settings are changed. Local free-only configuration cannot verify your provider account's billing status.

## Verification boundaries

Provider adapters have mock-backed discovery, completion, streaming and credential tests. A successful public/no-key endpoint probe is not proof that a newly created personal API key will work. Each supplied key is tested locally before activation, trying up to three configured free models. New providers without supplied keys remain unconfigured, not falsely marked healthy.
