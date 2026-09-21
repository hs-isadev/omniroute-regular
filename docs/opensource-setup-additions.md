# Open-source additions worth adding

OmniRoute already supports Ollama, LM Studio, and llama.cpp as loopback-only
providers. These are the next useful additions for a free/local-first setup:

| Project | Why it fits | Integration shape |
|---|---|---|
| [vLLM](https://github.com/vllm-project/vllm) | High-throughput OpenAI-compatible serving for a dedicated GPU host | Add a discovered local OpenAI-compatible endpoint; require explicit model and context capacity. |
| [LocalAI](https://github.com/mudler/LocalAI) | OpenAI-compatible local gateway with many backends | Reuse the local-provider adapter and keep the endpoint loopback-only by default. |
| [Jan](https://github.com/janhq/jan) | Desktop local model app with an OpenAI-compatible server | Add a setup probe for its local `/v1/models` endpoint; never import Jan credentials. |
| [GPT4All](https://github.com/nomic-ai/gpt4all) | Friendly desktop local inference | Prefer its documented local API when enabled; expose the loaded model's real context limit. |
| [text-generation-inference](https://github.com/huggingface/text-generation-inference) | Production-oriented Hugging Face serving | Support only as an explicitly configured OpenAI-compatible or adapter endpoint. |
| [LiteLLM](https://github.com/BerriAI/litellm) | Self-hosted compatibility gateway | Treat it as one upstream gateway, not as dozens of providers; keep nested fallback disabled unless explicitly configured. |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | Portable CPU/GPU GGUF serving | Already supported; improve setup discovery and show the loaded context size. |

The setup should never install model weights silently, enable public binding,
or infer that a hosted endpoint is free. Local providers remain outside the
hosted free-quota pool and are selected only when the user explicitly enables
them.

## Session files

OpenCode receives a stable `X-OmniRoute-Session` header from the generated
harness configuration. OmniRoute stores the local transcript under the
runtime root's `sessions` directory, not in the repository. Old turns are
deterministically compacted to the configured session budget while recent turns
remain intact. The daemon exposes:

```text
GET    /v1/sessions
GET    /v1/sessions/<id>
DELETE /v1/sessions/<id>
```

Session persistence is local-only, excludes credentials, and can be disabled
with `privacy.sessionFilesEnabled=false`.

The Windows and Linux key-entry surfaces provide six slots per hosted provider.
Supplied slots are encrypted together in the local vault and rotate under one
provider identity on normal transient, timeout, unavailable, or rate-limit
failures; authentication and invalid-request errors do not blindly retry. This
is ordinary user-authorized failover, not account duplication or quota evasion.

The default 24,000-token session budget is deliberately below the smallest
hosted consumer context envelope. Provider-specific failover still checks the
validated model context window plus the requested output before dispatch, so a
large transcript is compacted before it can strand a route in a retry loop.

The six nano roles are requirements, edge cases, implementation, tests,
provider/context, and safety. They are only eligible for low-risk small work,
are capped at 512 output tokens each, and execute in the configured parallel
waves (three by default). Disabled browser consumers are never started; when
enabled, their adapters receive the same bounded provider request shape as API
workers and retain their foreground/diagnostic restrictions.
