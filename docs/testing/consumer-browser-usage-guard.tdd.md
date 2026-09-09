# Consumer browser usage guard — TDD evidence

## Source and user journeys

The journeys were derived from the request to reduce account-ban risk in the consumer-browser adapters without adding fingerprint spoofing, CAPTCHA handling, or anti-bot bypasses.

- As an authorized consumer-account user, I want browser requests serialized and paced so concurrent callers cannot create a burst.
- As an authorized consumer-account user, I want a rolling request budget and increasing cooldowns so warning signals stop further automated submissions.
- As an operator, I want verification and access-block pages surfaced for manual action rather than bypassed.

## Task report

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Shared request guard | `node distribution/consumer-usage-guard.test.mjs` failed because `usage-guard.mjs` did not exist | `node distribution/consumer-usage-guard.test.mjs`: 6 tests passed | Concurrent calls serialize, starts are spaced, and rolling budgets delay excess work. |
| Cooldown and challenge stop | Same missing-module RED run | `consumer usage guard opens a cooldown...` and `challenge pages stop before submission` passed | Recognized throttle/verification signals stop the task and pause subsequent requests. |
| Adapter coverage | Same missing-module RED run | `all browser consumer adapters use the shared usage guard` passed | Claude, Z.AI, Qwen, Kimi, DeepSeek, and Perplexity adapter entrypoints are wired to the guard. |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Concurrent calls execute one at a time with minimum spacing | `consumer usage guard serializes calls and spaces request starts` | Unit | PASS |
| 2 | The rolling request budget delays a request until capacity returns | `consumer usage guard enforces a rolling request budget` | Unit | PASS |
| 3 | Connection diagnostics serialize with queries but do not consume the usage budget | `diagnostic calls share the queue without consuming request pacing` | Unit | PASS |
| 4 | A verification/throttle error opens a cooldown and prevents task execution | `consumer usage guard opens a cooldown after a verification or throttle signal` | Unit | PASS |
| 5 | Blocking-page text is detected narrowly and stops submission | `consumer block classification is narrow and challenge pages stop before submission` | Unit | PASS |
| 6 | Every consumer adapter imports and invokes the shared guard | `all browser consumer adapters use the shared usage guard` | Integration/source contract | PASS |

## Coverage and known gaps

Focused coverage command: `node --experimental-test-coverage distribution/consumer-usage-guard.test.mjs` — 93.08% lines, 91.80% branches, and 82.98% functions across the focused test and guard module.

Full regression command: `npm run test:regular` — 119 tests, 117 passed, 0 failed, and 2 platform-specific tests skipped.

The tests use fake clocks and fake page text; they do not contact consumer services, consume account quota, solve challenges, or prove that a service permits browser automation. No safeguard can guarantee that an account will not be restricted. Live-account validation was intentionally omitted.

## Merge evidence

- RED checkpoint: `6c111d2 test: add consumer browser usage guard coverage`
- Diagnostic queue RED checkpoint: `b75b3b9 test: keep browser diagnostics outside usage budget`
- GREEN checkpoint: recorded in the subsequent implementation commit after the focused and full regression targets passed.
