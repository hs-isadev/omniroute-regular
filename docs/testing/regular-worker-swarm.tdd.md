# Regular-mode bounded worker swarm — v0.6.1

## Source and user journeys

The journeys were derived from the 0.6.1 handoff request supplied for this run.

- As a user with a complex coding or high-risk request, I want bounded substantive workers to run concurrently and one worker to synthesize their drafts, so that difficult work receives implementation, test, and review attention without unbounded fan-out.
- As a user with a casual or easy repetitive request, I want one direct worker call, so that trivial work remains fast and quota-efficient.
- As a user near a model context limit, I want fan-out suppressed before dispatch, so that synthesis cannot exceed the selected model's declared context window.
- As an operator, I want each parallel outcome, fallback, cancellation, and final synthesis worker attributed, so that route audits remain explicit.

## RED and GREEN evidence

| Stage | Commit | Command | Result |
|---|---|---|---|
| RED: swarm behavior | `59c3737` | `.\\node_modules\\.bin\\tsx.cmd --test --test-concurrency=1 tests\\router.test.ts` | 38 passed, 3 failed for missing fan-out, missing context-skip decision, and missing synthesis. |
| GREEN: bounded swarm | `36b313d` | `npm run build` then the same focused router command | Build passed; 41/41 router tests passed. |
| RED: synthesis trust boundary | `96e282e` | Focused router command | 42 passed, 1 failed because the prompt called drafts “Validated subtask results.” |
| GREEN: synthesis trust boundary | `b2c9759` | `npm run build` then the focused router command | Build passed; 43/43 router tests passed. |

## Test specification

| # | Guarantee | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Casual and easy repetitive coding requests use exactly one direct worker each | `regular routing keeps casual and easy repetitive coding requests on one worker` | integration | PASS |
| 2 | Complex coding uses a worker count bounded by policy and exactly one final synthesis | `regular routing fans complex coding work out to a bounded API swarm and synthesizes once` | integration | PASS |
| 3 | Synthesis-context overflow suppresses fan-out | `regular routing skips swarm fan-out when synthesis context would overflow` | boundary | PASS |
| 4 | Groq rate limiting falls back to another healthy eligible API provider with explicit attribution | `regular swarm records rate-limit fallback outcomes and completes with another healthy API provider` | integration | PASS |
| 5 | A failed worker wave records every outcome and starts no synthesis | `regular swarm records every worker failure and skips final synthesis` | error path | PASS |
| 6 | Cancellation propagates, records cancelled workers, and starts no synthesis | `regular swarm propagates cancellation, records cancelled workers, and skips synthesis` | error path | PASS |
| 7 | Worker drafts are explicitly untrusted data and embedded instructions are rejected by the synthesis prompt | complex-coding swarm test prompt assertions | security | PASS |

## Coverage and known gaps

The focused router suite passed 43/43 after implementation. Full source,
distribution, security, package-manifest, secret-scan, and archive checks are
recorded in `distribution/VERIFICATION.md` after final packaging. Live browser
sign-ins remain account-dependent manual checks and are not claimed by these tests.

## Delegated review provenance

Architecture review route: `00MTRHDYVNYIXEK3IUPMEZPA`.
Independent implementation review route: `00MTRUZMDHSMR0D1AJP3IB4Q`.
