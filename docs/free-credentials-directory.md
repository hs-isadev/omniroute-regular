# Free-provider credential directory

Checked against official documentation on 2026-08-28. OmniRoute has 11 hosted
provider profiles and 3 local backends shared by both routing modes. This is
integration support, not a claim that every account is activated, available
in every region, permanently free, or live-tested.

## Hosted providers

| Provider ID | Get credentials locally | Import field | Free-access conditions |
|---|---|---|---|
| `openrouter` | [API keys](https://openrouter.ai/settings/keys) | `OPENROUTER_API_KEY` | Approved zero-price model ladder plus `openrouter/free`; quotas apply. Required by the current OpenCode regular wrapper. |
| `groq` | [API keys](https://console.groq.com/keys) | `GROQ_API_KEY` | Use Free Plan; [model-specific limits](https://console.groq.com/docs/rate-limits). |
| `gemini` | [AI Studio](https://aistudio.google.com/app/apikey) | `GEMINI_API_KEY` | Eligible project without paid billing; [free-tier pricing](https://ai.google.dev/gemini-api/docs/pricing). Account/region/age restrictions apply. |
| `mistral` | [Studio keys](https://console.mistral.ai/api-keys/) | `MISTRAL_API_KEY` | Studio Free mode, not Scale; evaluation/prototyping [limits](https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them). Model: `mistral-small-2603`. |
| `cohere` | [Trial keys](https://dashboard.cohere.com/api-keys) | `COHERE_API_KEY` | Evaluation key; observe [trial limits and use restrictions](https://docs.cohere.com/v2/docs/rate-limits). Model: `command-a-plus-05-2026`. |
| `cloudflare` | [Dashboard → Workers AI](https://dash.cloudflare.com/) | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | Workers AI Free plan; [10,000 Neurons/day](https://developers.cloudflare.com/workers-ai/platform/pricing/). Scoped Workers AI Read token, not Global API key. Copy the 32-character account ID too. Model: `@cf/zai-org/glm-4.7-flash`. |
| `huggingface` | [Access tokens](https://huggingface.co/settings/tokens) | `HF_TOKEN` | Inference permission; small [monthly credit](https://huggingface.co/docs/inference-providers/pricing). No paid balance/billing or custom paid provider keys. Model: `openai/gpt-oss-120b`. |
| `vercel` | [AI Gateway → API keys](https://vercel.com/ai-gateway) | `VERCEL_AI_GATEWAY_API_KEY` | [Monthly free credit](https://vercel.com/docs/ai-gateway/pricing), not intrinsically free models. Buying credits ends the free tier. No paid balance/top-up/BYOK. Model: `openai/gpt-oss-120b`. |
| `nvidia` | [Build → Get API Key](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b/build) | `NVIDIA_API_KEY` | Free hosted evaluation endpoint with limits/terms; no personal or confidential data. Model: `nvidia/nemotron-3-super-120b-a12b`. |
| `zai` | [Key management](https://z.ai/manage-apikey/apikey-list) | `ZAI_API_KEY` | Only [zero-price models](https://docs.z.ai/guides/overview/pricing): `glm-4.7-flash`, `glm-4.5-flash`. No paid search. Chat login/Coding Plan is not a developer API key. |
| `opencode-zen` | [Zen account](https://opencode.ai/auth) | `OPENCODE_ZEN_API_KEY` | Temporary [free models](https://opencode.ai/docs/zen/): Big Pickle, MiMo-V2.5 Free, Nemotron 3 Ultra Free. Disable auto-reload; no payment details or paid balance. Skip if signup requires payment. Free-period data may improve models. |

Model columns above show initial examples, not the complete current ladder.
Run `omni providers list` for the configured `freeModelOrder`. Added downgrade
pairs include GPT-OSS 120B → 20B on Groq, OpenRouter, Hugging Face and Vercel;
Gemini Flash → Flash-Lite; Mistral Small → Ministral 8B; Cohere Command A+ →
Command R7B; and Cloudflare GPT-OSS 120B → GLM-4.7-Flash. Models must still be
available, enabled, free-policy eligible and suitable for the task.

Verified smaller-model references: [Groq](https://console.groq.com/docs/model/openai/gpt-oss-20b),
[OpenRouter](https://openrouter.ai/openai/gpt-oss-20b:free),
[Hugging Face](https://huggingface.co/openai/gpt-oss-20b),
[Vercel](https://vercel.com/ai-gateway/models/gpt-oss-20b),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Ministral](https://docs.mistral.ai/models/ministral-3-8b-25-12),
[Cohere](https://docs.cohere.com/docs/models),
[Cloudflare](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/).
See [routing policy](routing-policy.md) for order, cooldowns and exclusions.

The eight added profiles are disabled until you explicitly confirm free-only
account settings and applicable use terms. Import validation makes a tiny
completion and consumes free quota. OmniRoute cannot independently inspect
billing: the confirmation flag is your attestation, not a billing API check.
Do not confirm a paid account. Disable a profile if its free offer ends or
you later change its billing plan.

Stored zero prices represent expected out-of-pocket cost within that confirmed
allowance, not the provider's list price or a balance meter. Quota exhaustion
does not authorize paid models, credit purchases, or paid-account fallbacks.
OmniRoute does not configure top-ups. Provider-side billing controls remain
essential.

## Local backends: no cloud credential

| Provider ID | Install / API documentation | Default local endpoint |
|---|---|---|
| `ollama` | [Ollama](https://ollama.com/download) | `http://127.0.0.1:11434/v1` |
| `lmstudio` | [LM Studio server](https://lmstudio.ai/docs/developer/openai-compat) | `http://127.0.0.1:1234/v1` |
| `llamacpp` | [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server) | `http://127.0.0.1:8080/v1` |

Load a model and start its server yourself. Enable an exact model ID from that
server's `/v1/models`, with its actual loaded context capacity:

```powershell
omni providers enable lmstudio --model YOUR_LOADED_MODEL_ID --context-tokens 32768 --coding
```

Replace the placeholder; omit `--coding` unless appropriate. Discovered models
are not automatically trusted/enabled. These profiles assume unauthenticated
loopback-only servers. They use your hardware, electricity, and storage.
They do not install models or bypass model licenses.

## Why not every provider or every chat login?

Free Claude chat access is not a reusable Claude API entitlement. Anthropic's
[authentication policy](https://code.claude.com/docs/en/legal-and-compliance)
does not permit third-party developers to route through consumer subscription
OAuth on users' behalf. Do not import passwords, browser cookies, or session
tokens. Future paid Claude orchestration stays in the supported native host;
its workers can use this same pool.

AI Horde's asynchronous protocol is not implemented. Pollinations' allowances
need further verification. Signup-credit-only and payment-required providers
are not added just to increase the count. Gateways already expose many upstream
model vendors; those are not counted as separate integrations.

Follow [the setup walkthrough](setup-walkthrough.md). Never paste keys in chat,
source control, a shell command, or the harness prompt.
