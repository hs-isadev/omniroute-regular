# Shared free-provider pool

Both routing modes use the same provider factory, vault, registry, and cost
policy. Run `omni providers list` for configuration; `omni models --refresh`
shows runtime model health.

Hosted profiles: OpenRouter, Gemini, Groq, Mistral, Cohere, Cloudflare Workers AI,
Hugging Face, Vercel AI Gateway, NVIDIA Build, Z.AI, OpenCode Zen.
Local backends: Ollama, LM Studio, llama.cpp. New profiles are opt-in;
providers missing credentials are inactive even if configuration says enabled.

OmniRoute now tries the best eligible model on a provider, downgrades within
that provider when it hits limits, then changes providers only after exhausting
its eligible models. See [routing policy](routing-policy.md) for cooldowns,
ranking and safety rules. `omni providers list` shows each configured ladder.

Regular mode selects a worker directly. Orchestrator mode uses
`openrouter/free` by default to plan against the same pool. Added profiles
are text/coding workers with conservative limits, not advertised as
vision/web/structured-output planners without verified support. Discovery
never enables arbitrary models.

The OpenCode wrapper remains regular-only; its host model remains pinned to
`openrouter/free`. The expanded pool is exposed through OmniRoute MCP tools;
it does not replace every model call OpenCode makes. The future paid native
Claude orchestration path is unchanged. Adding workers does not grant paid
Claude or GPT access.

Monthly-credit and evaluation profiles are labelled separately. Confirmation
does not inspect billing. Read the [credential directory](free-credentials-directory.md),
then follow [setup](setup-walkthrough.md). Credential/config changes require
stopping and starting the daemon. Z.AI has no model-list endpoint used here;
its health check sends a tiny completion and consumes free quota.
