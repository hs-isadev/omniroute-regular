# Fusion requirements-to-code matrix

This is the implementation map for the user-provided Fusion specification. It
records only local, testable behavior; provider availability remains live and
must be confirmed by the registry.

| Phase | Primary code surface | Acceptance evidence |
| --- | --- | --- |
| Durable task state | `packages/contracts`, `packages/core/task-state.ts`, daemon runtime | Versioned atomic envelopes, legal states, recovery, and idempotency tests |
| Live registry | `packages/config`, `packages/providers`, daemon `RegistryManager` | Discovery TTL, evidence expiry, capability/price/privacy gates |
| Route selection | `packages/core/free-failover.ts` | Deterministic free-only selection, cooldown, Retry-After, circuit breakers, loop rejection |
| Minimal context | `packages/core/delegation.ts` and context planner | Symbol/path references, deduplication, bounded excerpts and structured history |
| Controlled executors and OpenCode host | `packages/core/executor.ts`, CLI harness, and host proxy | Disabled-by-default command/workspace/environment allowlists, cancellation, and one live-registry-selected free host model |
| MCP lifecycle | `packages/mcp-server`, daemon HTTP surface, CLI backend | Typed submit/status/approval/pause/resume/cancel/verification/report operations |
| Browser consumers | `packages/browser-consumer-adapter`, startup installers | Explicit opt-in, small-task gate, serial budgets, foreground sign-in, challenge stop |
| Setup and packages | `distribution`, `scripts`, package smoke tests | Idempotent Windows/Linux setup, rollback, exclusion checks, checksums, smoke tests |
| Evaluation and release | `evals`, focused tests, full suite, security checks | Deterministic metrics, regression coverage, package validation |

The daemon is the sole durable-state owner. Executors do not own routing;
gateways may be an explicitly configured transport only and must not route back
into OmniRoute.
