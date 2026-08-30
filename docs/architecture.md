# Architecture

## Boundaries

OmniRoute is one daemon and one shared core. Host integrations translate a
supported host interface into the core request contract; they do not contain
routing policy or provider selection logic.

```text
CLI / dashboard / HTTP / MCP / hooks
                 |
       authenticated local daemon
                 |
  redaction -> registry -> mode selector -> deterministic validator
                                      |
                   worker executor / dependency scheduler / reviewer
                                      |
         OpenRouter | Gemini | Groq | local
                 |
          attribution + redacted audit metadata
```

Package responsibilities:

- `contracts`: versioned request, model, route-plan, event, usage, and
  attribution types plus deterministic validators.
- `config`: runtime paths under `%LOCALAPPDATA%\OmniRoute`, conservative
  defaults, budgets, retention, provider policy, and atomic persistence.
- `observability`: central redaction, structured local logs, and content-free
  route metadata.
- `vault`: current-user DPAPI master-key wrapping and independent AES-GCM
  records. No secret is stored in normal config or audit data.
- `providers`: stable provider interface and OpenAI, Anthropic,
  OpenAI-compatible, and local adapters.
- `core`: deterministic task signals, registry filtering, optional planner envelope,
  plan validation/repair, dependency scheduling, cancellation, review, budget
  enforcement, and attribution.
- `mcp-server`: supported stdio MCP surface with explicit server instructions.
- `integrations`: reversible, idempotent, structurally validated host changes.
- `daemon`, `cli`, `dashboard`: local transports and user experiences.

## Route lifecycle

1. The daemon authenticates a local token and allocates a monotonic ULID-like
   route identifier.
2. Diagnostics pass through central redaction. Prompts are not logged.
3. Deterministic signals estimate task class, risk, capabilities, tokens,
   attachment volume, outputs, dependency depth, tool use, and verification.
4. The enabled, allowed, and healthy registry is snapshotted.
5. Regular mode selects a free worker deterministically. Orchestrator mode sends
   a compact envelope to the configured free planner.
6. The returned plan is treated as untrusted data. Every provider, model,
   effort, capability, token, price, dependency, fan-out, concurrency, and
   budget decision is validated against the snapshot.
7. One constrained repair by the same planner is allowed. There is no silent
   paid fallback.
8. The executor streams providers that support streaming, schedules only
   dependency-ready subtasks, cancels descendants on abort, and synthesizes a
   decomposed result through the plan's attributed primary worker.
9. Optional review runs only when validated and budgeted.
10. A content-free attribution record is persisted and returned with a badge.

## State

Mutable state never lives in the repository. Windows defaults to:

```text
%LOCALAPPDATA%\OmniRoute\
  config.json
  vault\vault.json
  import\credentials.txt
  logs\omniroute.jsonl
  routes\routes.jsonl
  backups\
  state\daemon.json
  integrations\
```

The loopback dashboard exists because browsers cannot use Windows named pipes.
It binds only to `127.0.0.1`, validates bearer token, Host, Origin, request size,
rate, and CSRF headers. A current-user Windows pipe is also held as the daemon's
single-instance lock.

## No host-model guessing

Host model identity is `unknown` unless the host supplies an authoritative
documented field. MCP availability does not mean every prompt is intercepted.
Codex and Claude hooks provide routing context, but the standalone clients are
the only surfaces where OmniRoute can guarantee every request is routed.
