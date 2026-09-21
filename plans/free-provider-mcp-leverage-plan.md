# Free-provider and agent-runtime MCP leverage plan

Date: 2026-09-16
Status: planning only; this document does not change provider configuration or
start additional agents.

## Executive decision

Build a compliant free-tier control plane around OmniRoute, not a quota-evasion
farm. OmniRoute should remain the single MCP front door and routing authority.
It should discover and score legitimate free model endpoints, run local models,
and expose optional adapters for documented CLI, MCP, ACP, SDK, and browser
interfaces.

Do not rotate VMs, accounts, IPs, cookies, or browser profiles to manufacture
extra free usage. That is not a reliability feature; it is an abuse-control
evasion strategy and can cause account bans, data loss, or terms violations.

The useful objective is to maximize the value of every legitimately available
free request through good scheduling, context reduction, caching, capability
matching, and honest quota accounting.

## What “provider” means in this design

There are four different things that must not be conflated:

| Thing | Example | How OmniRoute should use it |
|---|---|---|
| Model endpoint | OpenRouter free route, Google AI Studio, Groq, Cloudflare, local Ollama | Native provider adapter; returns model responses and usage |
| Gateway/router | 9Router, LiteLLM, Kilo gateway, OpenCode provider layer | Optional upstream gateway; one routing layer must own fallback |
| Agent runtime | Cline, Aider, OpenHands, Goose, Kilo CLI, OpenCode CLI | Task-executor adapter through documented SDK/API/CLI/MCP/ACP |
| Browser consumer | Claude web, Z.AI web, other signed-in consumer sites | Foreground, serialized, small-task consumer adapter; never treated as a normal API |

A CLI coding agent can be part of the MCP system without becoming a model
provider: OmniRoute can expose `run_coding_agent` as a controlled tool. A
browser session can be part of the MCP system without becoming an HTTP model
endpoint: OmniRoute can expose `consumer_query` with strict task and usage
limits. Neither adapter should copy private credentials or bypass the product's
normal authentication flow.

## Current starting point

The source already has the important foundations:

- `routing.freeOnly` and zero-price model admission checks;
- provider and model metadata with capabilities, context, output limits,
  health, and free-model ladders;
- provider-first fallback and cooldown behavior;
- OpenRouter free routing as the configured orchestrator model;
- Gemini, Groq, OpenRouter, Kilo, OpenCode Zen, Cloudflare, Mistral, Cohere,
  Hugging Face, and other free/evaluation candidates in the catalog;
- six browser consumer definitions using a shared, isolated browser session;
- browser spacing, rolling budgets, challenge detection, and foreground
  diagnostics;
- bounded decomposition, worker attribution, and review logic.

The live worker metadata observed during planning reported `openrouter/free` as
healthy with tool calling, structured output, coding, and a 131K context window.
`gemini-3.7-flash` was also healthy with a 1M context window but depends on the
user's configured Google access. `kilo-auto/free` was healthy and coding-capable
but had unknown tool-calling/structured-output support. These are observations,
not permanent rankings.

The current default should therefore remain a dynamically discovered free route
until a repeatable benchmark proves that pinning one fixed model is better.

## Research findings

### 9Router

9Router presents a local OpenAI-compatible gateway, translates requests across
providers, tracks usage, supports OAuth/API-key connections, and exposes model
and combo aliases. Its architecture is close to a gateway layer, not a full
workspace agent. See the [9Router README](https://github.com/decolua/9router)
and [architecture notes](https://github.com/decolua/9router/blob/master/docs/ARCHITECTURE.md).

It can be useful as an optional upstream source for routes OmniRoute does not
support directly. It must not be stacked as an unobservable second fallback
engine. If 9Router selects a model and OmniRoute also selects and retries, the
system loses clear quota ownership and may duplicate requests.

### OpenRouter and Kilo

OpenRouter's official free router selects an available free model compatible
with request capabilities, while `:free` variants can have different limits and
availability. It is valuable for capability-based orchestration, but free
models are rate-limited and availability changes. See the [OpenRouter free
router documentation](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground)
and [free variant documentation](https://openrouter.ai/docs/guides/routing/model-variants/free).

Kilo documents a free gateway route (`kilo-auto/free`) and a changing catalog of
free models for its IDE, CLI, and cloud workflows. It warns that free routes may
be rate-limited and that some evaluation providers may log prompts and outputs.
See [Using Kilo for Free](https://kilo.ai/docs/getting-started/using-kilo-for-free)
and [Kilo model selection](https://kilo.ai/docs/code-with-ai/agents/model-selection).

Both should be registered as explicit upstream providers. Their free status,
privacy, and capabilities must be rechecked before dispatch.

### OpenCode, Cline, OpenHands, Aider, and Goose

- [OpenCode providers](https://opencode.ai/docs/providers) expose many providers
  through a common provider layer and also support local models. Use its
  documented provider configuration only; do not read its auth file.
- [Cline's SDK provider layer](https://github.com/cline/cline/blob/main/docs/sdk/model-providers.mdx)
  exposes provider/model registries and an agent runtime. Its MCP support is an
  integration surface, not permission to borrow private sessions.
- [OpenHands SDK](https://docs.openhands.dev/sdk/arch/sdk) provides a composable
  reasoning loop, typed tools, workspace abstraction, state, MCP, and local or
  remote execution. It is the best candidate for a future embedded executor,
  but it would duplicate parts of OmniRoute's existing agent loop.
- [Aider's repository map](https://aider.chat/docs/repomap.html) is a useful
  idea for reducing code context. Aider is most useful as a local, scripted
  coding executor with Git and test integration, not as a hidden provider.
- [Goose](https://block.github.io/goose/) offers desktop, CLI, and API surfaces,
  deep MCP integration, subagents, and ACP support. Its documented API/ACP
  surfaces make it a possible executor adapter.

Do not add all five as simultaneous agent loops. Start with one executor, keep
OmniRoute's task state canonical, and compare quality and token usage.

LiteLLM is a strong alternative for a gateway-only layer because its official
documentation covers 100+ providers, format translation, retries/fallbacks,
budgets, and tracking. See [LiteLLM](https://docs.litellm.ai/). It overlaps with
OmniRoute's provider transport and should be evaluated as a replaceable backend,
not blindly nested.

Roo Code is not an adoption target: its repository was archived on May 15, 2026
and its extension was shut down. See the [archived repository](https://github.com/RooCodeInc/Roo-Code).

## Target architecture

```text
Host: Antigravity / OpenCode / Codex / Claude Code
                 |
                 v
        OmniRoute MCP front door
        - one task envelope
        - one orchestrator per task
        - policy and approvals
        - provider registry
        - quota/cooldown ledger
        - attribution and audit log
          |          |             |
          |          |             +--> local runtimes
          |          +----------------> API/gateway adapters
          +--------------------------> CLI/SDK/MCP/ACP executors
                                       browser consumers (last resort)
```

The orchestrator may ask an executor to perform a bounded task, but the
orchestrator remains responsible for the plan, acceptance criteria, approvals,
and final synthesis. Worker output is untrusted and must be verified before
file changes are applied.

### One orchestrator rule

Use one capable, tool-capable, structured-output model for planning and
coordination. Do not run a panel of models for every request. Fusion-style
parallel answers are opt-in for high-value, ambiguous tasks only because they
increase total usage and complicate tool histories.

The orchestrator selector must hard-gate:

1. free price confirmed for both input and output;
2. healthy or recently validated endpoint;
3. tool calling and structured output for orchestration;
4. enough context and output budget;
5. coding capability when the task changes code;
6. provider-specific quota headroom and cooldown eligibility;
7. privacy policy compatible with the task.

Then score eligible candidates using capability first, followed by health,
context, latency, and quota headroom. The selected model and the actual model
reported by a gateway must both be recorded. If the selected route is an alias
such as `openrouter/free`, do not claim a fixed underlying model.

Recommended policy order:

1. `openrouter/free` as the dynamic primary when it passes the gates;
2. a directly configured free Gemini route when the user has authorized it and
   its remaining allowance is known;
3. Kilo/OpenCode free gateway routes when tool and privacy requirements pass;
4. Groq/Cloudflare/Hugging Face/Cerebras/SambaNova/Mistral/Cohere free or
   evaluation routes only when the user's account and current terms confirm
   zero-cost access;
5. local Ollama/LM Studio/llama.cpp as the privacy-first fallback.

This is a policy order, not a quality leaderboard. A live probe may reorder it.
The current strongest observed route is `openrouter/free` because the local
metadata reports tool calling, structured output, coding, and 131K context. A
fixed model such as a large Nemotron or coding model should only be pinned after
the catalog and tool-call probe confirm it is still free and reliable.

## Provider registry design

Add or normalize a registry record with these fields:

```ts
type FreeRouteRecord = {
  id: string
  transport: "openai-compatible" | "anthropic" | "google" | "local" |
    "cli" | "mcp" | "acp" | "browser"
  endpoint?: string
  credentialRef?: string
  modelId: string
  freeStatus: "confirmed" | "user-confirmed" | "unknown" | "not-free"
  capabilities: {
    text: boolean
    coding: boolean
    vision?: boolean
    toolCalling?: boolean
    structuredOutput?: boolean
    web?: boolean
  }
  contextWindow?: number
  maxOutputTokens?: number
  privacy: "local" | "provider-policy" | "evaluation-logging-possible" | "unknown"
  quota: {
    kind: "provider-reported" | "user-entered" | "unknown"
    remaining?: number
    resetAt?: string
    requestsPerMinute?: number
  }
  maxConcurrentRequests: number
  allowedTaskClass: "micro" | "small" | "medium" | "large" | "critical"
  termsUrl?: string
  lastValidatedAt?: string
  health: "healthy" | "cooling-down" | "unhealthy" | "unknown"
}
```

Unknown values are not zero. A route with unknown pricing, quota, tool
support, or privacy must not be eligible for confidential or high-risk work.

### Discovery and probes

Run discovery at startup and periodically, but never turn discovery into a
permission grant. For each candidate, perform a low-cost probe only if the user
has enabled that provider:

- simple text completion;
- structured-output response;
- tool-call round trip;
- context-limit check using a bounded synthetic payload;
- cancellation and timeout behavior;
- usage metadata and provider request ID;
- error classification and `Retry-After` handling.

Cache probe results with a short TTL. Do not probe every model on every request.
Never use real project secrets as probe content.

## Adapter plan

### Phase A: Native API and local transports

Prioritize OpenAI-compatible endpoints and local runtimes because they have
clear request/response boundaries and can be represented by the existing
provider abstraction.

Candidate inputs include OpenRouter, Kilo, OpenCode gateway routes, Google,
Groq, Cloudflare, Mistral, Cohere, Hugging Face, Cerebras, SambaNova, Vercel,
and local Ollama/LM Studio/llama.cpp. Each provider remains opt-in and
free-confirmed. Keep credentials in the existing vault/environment mechanism;
never write keys to the plan, prompts, logs, MCP envelopes, or Git.

### Phase B: Gateway adapters

Support 9Router and LiteLLM only as explicit upstream gateways:

- configure one local endpoint;
- import no private database or auth files;
- use a user-created local token or documented environment variable;
- expose the gateway's model list and usage metadata;
- disable nested automatic fallback when OmniRoute owns fallback;
- tag every route with `gateway=9router` or `gateway=litellm`;
- detect loops such as OmniRoute → 9Router → OmniRoute and fail closed;
- maintain a per-gateway request budget and circuit breaker.

The first gateway experiment should be read-only model discovery plus one
small text request. Do not make the gateway the orchestrator until attribution,
tool calls, cancellation, and quota accounting are verified.

### Phase C: CLI and SDK executors

Create a generic `agent-executor` contract:

```text
prepare(workspace, task, allowedPaths, timeout)
run(command, stdin, environmentAllowlist)
stream(stdout/stderr)
collect(changes, tests, exitCode, usageIfReported)
cleanup()
```

Implement one adapter at a time:

1. Aider: use its documented CLI/script mode, repository map, Git diff, and
   test/lint hooks. Return a patch/report; do not let it commit or push.
2. Cline: prefer the documented SDK or CLI/MCP surface when installed. Keep its
   own model choice visible; do not extract credentials from extension storage.
3. Goose: use API/ACP/MCP where available; isolate its workspace and approvals.
4. OpenHands: evaluate its SDK only if a second agent loop is justified; its
   workspace and state system overlap with OmniRoute.
5. Kilo/OpenCode: treat their CLI as executors or gateways depending on the
   documented interface actually available on the machine.

Every executor must run in a dedicated worktree or explicitly approved local
workspace, with an allowlisted environment, bounded output, timeout, and no
automatic push, delete, install, or credential-management operation.

### Phase D: Browser consumer adapters

Keep the existing browser consumers as a last-resort transport for small,
account-bound tasks:

- foreground shared session when diagnostics or sign-in is required;
- one request at a time per consumer;
- visible user login and no storage/cookie extraction;
- dedicated profile and loopback CDP only;
- no captcha or challenge automation;
- conservative spacing and rolling request budgets;
- stop on verification, throttle, policy, or challenge pages;
- do not run them in implementation swarms;
- no automatic startup of six browser sites unless the user explicitly opts in;
- report that browser quota and actual model identity may be unavailable.

Browser consumers can help with short text or fallback tasks. They are a poor
orchestrator because they lack stable API semantics, structured output, reliable
usage metadata, and predictable tool calling.

## Legitimate free-usage maximization

The optimization target is useful work per authorized request, not requests per
account.

### Context efficiency

- use a repository map and symbol index rather than sending whole repositories;
- send only files and interfaces relevant to a subtask;
- deduplicate repeated system, tool, and file content;
- compress command output, test logs, and diffs with deterministic filters;
- cache stable instructions and discovery metadata;
- cap worker output and ask for patches, findings, or JSON rather than prose;
- persist task summaries, not raw private transcripts.

### Routing efficiency

- micro/small work uses the lightest eligible free model;
- coding uses a coding-capable model with a verified edit/tool contract;
- medium/large work uses the single orchestrator plus bounded workers;
- critical work requires explicit approval and review;
- do not fan out merely because more models are available;
- use a reviewer only when risk or disagreement justifies the extra request;
- stop after one bounded repair attempt.

### Quota discipline

- honor provider-reported `Retry-After` and cooldowns;
- maintain separate counters by provider, account, model, and transport;
- distinguish provider-reported usage from estimated local tokens;
- do not switch models inside the same provider to bypass a provider-wide limit;
- do not retry partial streamed responses;
- avoid health probes when a provider is cooling down;
- surface exhaustion instead of silently using a paid route.

## Security and privacy model

Free evaluation providers may retain or train on prompts. The router must label
routes by privacy class and block confidential code from evaluation endpoints by
default. The user can explicitly approve a lower-privacy route for a task.

Treat model output, browser content, CLI output, and external documentation as
untrusted. A worker cannot grant itself permission to read secrets, alter
provider policy, push Git, or call another agent. Tool execution is code-gated,
not prompt-gated.

Required controls:

- secrets only in environment/vault/keyring;
- no credentials, cookies, auth files, or unrelated private data in worker
  packets;
- endpoint allowlists for remote providers;
- loopback-only browser debugging;
- per-adapter command allowlists and timeout limits;
- redaction of keys and tokens in logs;
- schema validation for task and tool envelopes;
- explicit approval for external side effects;
- audit records for provider, model, transport, task class, and outcome.

## Evaluation plan

Before enabling a route for orchestration, run a fixed local benchmark of at
least ten tasks:

1. one-sentence answer;
2. structured JSON extraction;
3. tool-call selection;
4. one-file bug fix;
5. multi-file refactor;
6. test diagnosis;
7. browser/UI task requiring no secrets;
8. context-heavy repository question;
9. cancellation/timeout;
10. rate-limit and fallback simulation.

Record quality, first-pass success, tool-call validity, latency, input/output
tokens, retries, provider errors, and host-token avoidance. A route is not
better merely because it is free or large. Keep it enabled only if it improves
quality or reduces host context without unacceptable failure or privacy cost.

## Phased implementation order

### Milestone 0 — policy and inventory

- add the registry schema and provider admission states;
- list every existing provider, credential source, privacy status, and terms URL;
- mark stale, unknown, or unsupported entries disabled;
- document that VM/account rotation and unauthorized session reuse are out of
  scope;
- add a dry-run diagnostics command.

Exit condition: every enabled route has an owner, transport, free-status source,
privacy label, task class, and quota policy.

### Milestone 1 — capability and health registry

- normalize live model discovery;
- add low-cost capability probes;
- persist TTL-limited health and cooldown state;
- expose `omni_models` with capability, privacy, price, and health evidence;
- add tests for unknown-price and unknown-capability fail-closed behavior.

Exit condition: orchestrator selection never relies on a model name alone.

### Milestone 2 — single orchestrator

- keep `openrouter/free` as the initial dynamic orchestrator;
- enforce tool calling, structured output, context, privacy, and free gates;
- return actual model identity when the upstream reports it;
- fall back only through the deterministic eligible free ladder;
- make planner/worker/reviewer token budgets visible.

Exit condition: one task has one attributed orchestrator and no hidden second
planner.

### Milestone 3 — gateway and local adapters

- add one 9Router or LiteLLM upstream adapter;
- add local Ollama/LM Studio discovery;
- prove no routing loops and preserve request/usage attribution;
- compare gateway quality and reliability against direct OpenRouter/Kilo paths.

Exit condition: the gateway can be removed without changing OmniRoute task
semantics.

### Milestone 4 — one CLI executor

- implement Aider or Cline first, selected by the installed documented API;
- run in a disposable worktree;
- capture diff, tests, errors, and usage metadata;
- require approval before applying or merging changes.

Exit condition: executor failures are isolated and cannot mutate the host's
provider configuration or secrets.

### Milestone 5 — optional MCP/ACP executors and browser fallback

- add Goose/OpenHands only after the first executor proves useful;
- keep browser consumers foreground, serialized, small-only, and opt-in;
- add explicit browser health and sign-in state to `omni_models`;
- disable consumer routes for medium/large/critical tasks.

Exit condition: every adapter is independently disableable and the system still
works with direct API/local routes only.

### Milestone 6 — token efficiency and controlled Fusion

- add deterministic command-output and diff compression;
- add repository-map/context slicing and stable prompt caching;
- add opt-in two-worker review for high-value tasks;
- report total worker usage separately from avoided host context;
- stop if Fusion improves host quota but increases total work without quality
  benefit.

Exit condition: five real tasks show measured benefit, not just more activity.

## Non-goals

- bypassing provider quotas, rate limits, or abuse controls;
- creating or rotating duplicate accounts;
- CAPTCHA, challenge, or paywall automation;
- scraping browser cookies or private auth databases;
- silently turning a CLI subscription into a general API;
- automatic GitHub pushes or paid fallback;
- running every agent framework in parallel on every task;
- claiming unlimited inference from any free tier.

## Definition of done

The work is successful when:

- one MCP endpoint can discover and route across legitimate free API, local,
  gateway, CLI, and browser adapters;
- one capable free orchestrator selects by live capability and health;
- every route is attributed and quota/cooldown-aware;
- free-only mode cannot accidentally select a paid or unknown-price model;
- CLI and browser adapters are controlled executors, not credential leaks;
- context compression reduces repeated input without corrupting tool history;
- users can disable any provider or adapter independently;
- ten benchmark tasks and security tests pass;
- no VM/account rotation or other quota-evasion mechanism is present.

## Sources

- [9Router README](https://github.com/decolua/9router)
- [9Router architecture](https://github.com/decolua/9router/blob/master/docs/ARCHITECTURE.md)
- [OpenRouter free models router](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground)
- [OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free)
- [Kilo free usage](https://kilo.ai/docs/getting-started/using-kilo-for-free)
- [Kilo model selection](https://kilo.ai/docs/code-with-ai/agents/model-selection)
- [OpenCode providers](https://opencode.ai/docs/providers)
- [Cline provider SDK](https://github.com/cline/cline/blob/main/docs/sdk/model-providers.mdx)
- [Cline MCP](https://github.com/cline/cline/blob/main/docs/mcp/mcp-overview.mdx)
- [OpenHands SDK](https://docs.openhands.dev/sdk/arch/sdk)
- [Aider repository map](https://aider.chat/docs/repomap.html)
- [Goose](https://block.github.io/goose/)
- [LiteLLM](https://docs.litellm.ai/)
- [Roo Code archive notice](https://github.com/RooCodeInc/Roo-Code)
