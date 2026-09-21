# Implementation prompt: compliant free-provider MCP aggregation

You are implementing the plan in:

`C:\Users\thest\Downloads\subagent\omniroute-source-foreground\plans\free-provider-mcp-leverage-plan.md`

Work only in the OmniRoute source repository. Read the repository's applicable
`AGENTS.md` instructions first. Inspect the existing provider catalog, routing,
browser-consumer adapter, MCP server, attribution, usage guard, tests, and
packaging before changing code.

## Goal

Make OmniRoute a single, MCP-addressable control plane for legitimately
available free API providers, local models, documented gateways, and optional
CLI/SDK/MCP/ACP/browser executors. Use one capable free model as the
orchestrator, selected by live capability and health evidence.

## Absolute boundaries

Do not implement or suggest:

- VM, account, IP, proxy, cookie, or browser-profile rotation to evade quotas;
- duplicate-account creation or free-trial abuse;
- CAPTCHA/challenge bypass;
- browser-cookie or auth-database extraction;
- credential injection into Cline, Aider, OpenHands, Goose, Kilo, OpenCode,
  9Router, or any other third-party private storage;
- silent paid fallback, top-up, subscription circumvention, or automatic Git
  push/merge;
- a hidden second planner or an unbounded multi-agent swarm.

Fail closed on unknown price, unknown quota, unknown tool support, unknown
privacy, unavailable provider, or routing loops. Preserve existing credentials,
provider settings, and user changes.

## Required implementation order

1. Inventory the current source and tests. Identify stale instructions and
   existing functionality before editing.
2. Add or normalize a registry record for transport, model, free status,
   capabilities, context/output limits, privacy, terms URL, quota source,
   health, cooldown, concurrency, and allowed task class.
3. Add live discovery/capability probes with TTLs. Probes must use synthetic
   content only and must not be sent to disabled providers.
4. Make the orchestrator use one eligible free route. Start with the existing
   `openrouter/free` route if it passes current gates. Return the actual model
   identity when the upstream provides it; never invent one for an alias.
5. Preserve deterministic provider/model fallback, `Retry-After`, partial-stream
   behavior, per-provider concurrency, attribution, and free-only admission.
6. Add exactly one optional gateway adapter first: either 9Router or LiteLLM.
   Treat it as one upstream endpoint, not a second routing authority. Add loop
   detection, per-gateway attribution, and a circuit breaker.
7. Add one documented CLI/SDK executor first, chosen from the interface actually
   installed and supported. Prefer Aider or Cline. Use a disposable worktree,
   command allowlists, bounded output, timeout, environment allowlist, diff
   capture, and approval before applying changes.
8. Keep browser consumers foreground/diagnostic, one request at a time,
   small-task-only, user-signed-in, and opt-in. Do not put them in parallel
   implementation swarms or make them the orchestrator.
9. Add deterministic context savings: repository-map/symbol slicing, repeated
   content deduplication, command-output/diff compression, bounded summaries,
   response caps, and prompt caching where safe. Preserve tool-call history.
10. Add tests and documentation. Do not package credentials, sessions, or
    personal workspaces.

## Provider families to evaluate

Evaluate, but do not automatically enable, the existing and documented routes
for OpenRouter, Kilo, OpenCode, Google/Gemini, Groq, Cloudflare, Mistral,
Cohere, Hugging Face, Cerebras, SambaNova, Vercel, Ollama, LM Studio, and
llama.cpp. Free status must be confirmed from current provider metadata, the
user's account state, or an explicit user confirmation. Local runtimes count as
free inference but require the user's hardware and model files.

Treat 9Router and LiteLLM as gateway candidates. Treat Cline, Aider, OpenHands,
Goose, Kilo CLI, OpenCode CLI, and similar software as executors or gateways,
not as anonymous model endpoints.

## Orchestrator acceptance criteria

The orchestrator candidate must have:

- text and coding support;
- tool calling and structured output;
- known context and output limits;
- confirmed zero input/output price under free-only mode;
- healthy status and a bounded timeout;
- usage/route attribution;
- safe fallback behavior;
- no confidential-data policy violation.

The selector must prefer capability and health, then context and latency, with
quota headroom as a tie-breaker. It must not choose on model-name prestige or
parameter count alone. Keep one orchestrator per task. Fusion/review is opt-in
and budgeted.

## CLI executor acceptance criteria

The executor must:

- use an official/documented CLI, SDK, API, MCP, or ACP interface;
- never read or write another tool's private credentials;
- run against an approved workspace/worktree;
- expose stdout/stderr and exit status;
- return changed paths, diff, tests, and reported usage;
- reject destructive or external side effects without approval;
- stop on timeout, challenge, auth failure, or malformed output;
- be independently disableable.

## Browser executor acceptance criteria

The browser adapter must:

- use a dedicated profile and loopback-only CDP;
- keep the window foreground when sign-in or diagnostics are needed;
- require the user to sign in normally;
- serialize requests and honor spacing/rolling budgets;
- stop on challenge, verification, throttle, or policy notices;
- never read cookies, local storage, or auth databases;
- report unknown model identity/quota honestly;
- remain restricted to small tasks and never be the default orchestrator.

## Tests to add or update

Add focused tests for:

- registry schema validation and free-only fail-closed behavior;
- provider/model capability and privacy gating;
- stale discovery and cooldown handling;
- `Retry-After`, partial streams, cancellation, and circuit breakers;
- gateway loop detection and attribution;
- CLI command allowlist, worktree scope, timeout, and secret redaction;
- browser serialization, foreground setup, challenge stop, and quota guard;
- tool-call and structured-output preservation through compression;
- one-orchestrator/no-hidden-planner behavior;
- ten-task evaluation fixtures from the plan.

Run the smallest relevant tests after each change, then the full package,
distribution, and security checks. Report commands and results. If the source
checkout lacks dependencies or a build tool, say so instead of claiming a
package was rebuilt.

## Deliverables

- implementation changes with focused tests;
- updated source and package documentation;
- provider/adapter registry entries with terms and privacy notes;
- a concise migration note for existing users;
- a verification report with route IDs/model IDs where available;
- no new credentials, sessions, or personal files in Git.

Before finalizing, review the diff for accidental secrets, hidden paid paths,
quota-evasion behavior, nested routing loops, and stale instructions. Keep the
host responsible for approvals and final verification.
