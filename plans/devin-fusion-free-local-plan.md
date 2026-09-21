# Devin Fusion-style local orchestration plan

Date: 2026-09-16
Baseline: OmniRoute source branch `b1a4fa3`
Status: long-term reference only. The practical MVP plan supersedes this for
the first implementation: `plans/devin-fusion-practical-mvp.md`.

## Objective

Add an optional Devin/Fusion-style software-engineering workflow to OmniRoute:
one task is decomposed into bounded roles, independent workers can work in
parallel when safe, changes are tested and reviewed, and a final integrator
produces one verified result.

The default path must use the user's existing free-tier accounts, BYOK APIs,
or signed-in browser consumer adapters. Paid APIs, paid Devin jobs, and paid
fallbacks must be opt-in and disabled by default. This is a Fusion-style
workflow, not a claim that it is the Devin product or that Devin's private
implementation is being reproduced.

## Explicit boundaries

- No credential, cookie, browser profile, or authentication-file forwarding.
- Browser sign-ins, user API keys, and Antigravity setup remain the only manual
  setup exceptions.
- No CAPTCHA, anti-bot, rate-limit, or access-control bypass.
- No external GitHub push, merge, release upload, or remote Devin job without
  an explicit approval gate.
- No paid provider fallback when a free route is unavailable.
- The shared six-provider browser session remains foreground by default for
  diagnostics; background mode may remain an explicit advanced option.
- The existing regular routing policy, attribution, quotas, cooldowns, and
  small-only browser limits remain authoritative.

## Architecture

```text
User task
   -> task intake and budget gate
   -> planner creates a typed task graph
   -> worker pool: API, browser consumer, local host, or optional Devin bridge
   -> isolated workspace/worktree outputs
   -> test and security gates
   -> reviewer workers
   -> integrator applies the approved patch
   -> attributed result, diff, tests, and rollback point
```

The optional Devin bridge should implement the same worker contract as every
other worker. It must be replaceable by local OmniRoute workers, so the system
still works when Devin is unavailable or not configured.

## Delivery steps

### Step 1 — Capability and contract audit

Context: inspect `packages/core`, routing/provider contracts, MCP server code,
observability, browser consumer adapters, distribution setup, and existing
plans. Confirm the exact current gap: there is no Devin Fusion implementation.

Deliverables:

- Architecture decision record distinguishing “actual Devin integration” from
  “Fusion-style local orchestration”.
- Typed worker request/result contract with task ID, role, allowed files,
  budget, status, diff, tests, attribution, and failure reason.
- Explicit list of supported worker transports: local host, BYOK API,
  browser consumer, and optional remote Devin adapter.

Exit criteria: contract review identifies no secret leakage, unbounded worker
loop, silent paid fallback, or ambiguous ownership of workspace changes.

### Step 2 — Task graph and budget controller

Context: build on existing bounded routing and concurrency controls. Add task
roles such as planner, implementer, test runner, reviewer, and integrator.

Deliverables:

- DAG representation with dependencies, file ownership, and serial/parallel
  eligibility.
- Per-task and per-provider token/call/time budgets.
- Default low-cost mode: one planner, at most two independent workers, one
  reviewer, and one integrator.
- Stop conditions for quota exhaustion, repeated failure, conflicting diffs,
  missing credentials, and user approval requirements.

Exit criteria: deterministic tests prove workers cannot exceed configured
parallelism or continue after a hard budget stop.

### Step 3 — Provider-neutral worker adapters

Context: preserve current provider and browser adapter boundaries. Do not make
core depend directly on Devin or any single model vendor.

Deliverables:

- Worker interface plus adapters for existing local/API/browser routes.
- Optional Devin adapter behind an explicit configuration flag, with timeout,
  cancellation, status polling, and unavailable-service handling.
- Free-first routing policy; paid Devin/API routes require explicit opt-in and
  a visible per-task budget.
- Attribution that records provider, transport, model/host authority, route
  ID, and whether the result was API or browser-consumer traffic.

Exit criteria: the same task graph runs with the optional Devin adapter absent;
no credentials or unrelated context enter worker packets.

### Step 4 — Isolated execution and patch integration

Context: workers must not edit the canonical checkout concurrently. Use
worktrees or equivalent isolated directories with declared file ownership.

Deliverables:

- Workspace snapshot/checkpoint before dispatch.
- Per-worker patch collection and conflict detection.
- Test execution in the worker workspace.
- Integrator applies only approved patches after review.
- Rollback command that restores the checkpoint without touching user data.

Exit criteria: conflicting workers are surfaced for review; failed or cancelled
tasks leave the canonical workspace unchanged.

### Step 5 — Review, evidence, and user approval gates

Context: Fusion-like parallel output is useful only if the final result is
auditable.

Deliverables:

- Reviewer checks for correctness, security, tests, dependency changes, and
  accidental secrets.
- Final synthesis includes changed files, test commands/results, attribution,
  unresolved risks, and exact approval-needed actions.
- Separate gates for local edits, commit, GitHub push, release upload, and any
  paid/remote Devin dispatch.

Exit criteria: a task cannot be reported complete without diff and validation
evidence, and external publication remains user-approved.

### Step 6 — One-click setup and diagnostics

Context: the package goal is one click except browser sign-ins, BYOK, and
Antigravity setup. The current six-browser session is foreground-oriented for
diagnostics.

Deliverables:

- Setup screen for enabling Fusion-style orchestration, choosing free/API/
  browser/Devin routes, and setting budgets.
- Safe defaults that keep Devin and paid APIs disabled.
- Visible status for sign-in-required, API-key-required, Antigravity-required,
  quota-exhausted, and worker-failed states.
- Foreground browser launch and error visibility documented for Windows/Linux.
- Upgrade/rollback compatibility for existing installations and config.

Exit criteria: fresh install and rerun preserve user data, require only the
three stated manual exceptions, and never silently open a paid route.

### Step 7 — Evaluation and staged release

Context: do not compare against Devin by anecdote. Measure the workflow on
representative coding tasks.

Deliverables:

- Small benchmark suite covering planning, parallel implementation, conflict,
  test failure, quota stop, browser sign-in pause, and rollback.
- Metrics for completion rate, cost/tokens, wall-clock time, test pass rate,
  human interventions, and incorrect patch rate.
- Feature flag and opt-in preview release.
- Honest documentation separating verified local behavior from unverified
  Devin-service behavior.

Exit criteria: release only after regression, security, extracted-package, and
manual host acceptance tests pass on supported platforms.

## Dependency graph

`Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6 -> Step 7`

Step 3 adapter implementations can be developed in parallel after Step 2 if
they use the frozen worker contract. Step 6 documentation/UI work can begin
after the contract and budget defaults are approved, but release remains
blocked until Steps 4–5 are complete.

## Recommended first implementation slice

Implement Steps 1–2 only first. This gives OmniRoute a safe task graph and
budget gate before adding any Devin-specific transport. Then add one local/API
worker adapter and one reviewer path. Add the actual Devin bridge last and only
if a supported Devin API/account workflow is available.

## Rollback strategy

Keep the feature behind a disabled flag. Preserve the existing router and
browser-adapter paths. Remove only task-owned configuration and code if the
feature is disabled; retain user keys, browser profiles, host configuration,
and prior installed versions.

## Next-session implementation prompt

```text
Read plans/devin-fusion-free-local-plan.md and implement it in the OmniRoute
source repository. This is an implementation task, not a redesign discussion.

Start with Steps 1–2 only: audit the current architecture, add the typed worker
contract, task graph, dependency/ownership model, and hard budget controller.
Do not implement a Devin API bridge yet. Keep the feature disabled by default.
Use existing routing, attribution, quota, cooldown, security, and browser
consumer boundaries. Do not send credentials, cookies, auth files, or unrelated
private context to workers. Do not add paid fallbacks.

Use tests first for budget stops, max parallelism, cancellation, dependency
ordering, conflicting file ownership, missing credentials, and attribution.
Run the narrowest relevant tests, then the existing regular and security tests.
Report exact files changed, commands run, results, remaining risks, and the
next safe slice. Do not push, publish, upload releases, dispatch paid/remote
jobs, or modify live host credentials without asking for approval.
```

## Deep implementation blueprint

### 1. Product definition

The target experience is a supervised autonomous coding loop:

1. The user gives one repository task and an acceptance statement.
2. OmniRoute inspects the repository and creates a bounded work plan.
3. Independent work items are assigned to different eligible workers.
4. Each worker operates in an isolated workspace and returns a patch plus
   evidence rather than editing the canonical checkout.
5. A test worker validates each patch and a reviewer checks the combined result.
6. An integrator applies only compatible, approved changes.
7. OmniRoute reports the final diff, test evidence, worker attribution, budget
   consumption, and any remaining human actions.

This is the behavior to reproduce, not Devin's proprietary service internals.
The first release should optimize for reliability and inspectability rather than
maximum parallelism.

### 2. Current repository seams to preserve

The implementer should start by reading these existing seams before designing
new ones:

- `packages/core`: routing, delegation, failover, and policy decisions.
- `packages/contracts`: shared request/result shapes and validation boundaries.
- `packages/providers`: API provider discovery and transport behavior.
- `packages/mcp-server`: host-facing worker tools and MCP lifecycle.
- `packages/observability`: route IDs, token accounting, and audit records.
- `packages/browser-consumer-adapter`: browser transport, sign-in pauses,
  foreground diagnostics, and shared six-provider sessions.
- `apps/cli`: local command-line entry points and host task execution.
- `distribution/dual-setup.mjs`: one-click setup, host connections, browser
  startup, and the three manual setup exceptions.
- `tests/`, `distribution/*.test.mjs`, and `evals/`: existing regression and
  package acceptance coverage.

Do not create a second router, second credential store, or second attribution
system. The Fusion-style layer should orchestrate existing capabilities through
small interfaces.

### 3. Proposed domain model

Use validated records rather than free-form internal objects. Exact TypeScript
names may change during implementation, but the following fields are required.

#### TaskRequest

- `taskId`: locally generated opaque ID.
- `repositoryRoot`: canonical absolute path, validated and symlink-safe.
- `baseRevision`: immutable commit or workspace snapshot identifier.
- `objective`: user request with explicit acceptance criteria.
- `allowedPaths`: allowlist; empty means the planner must derive and display it.
- `manualApprovalPolicy`: edit, commit, push, release, remote job, and paid API
  gates.
- `budget`: max wall time, total calls, total estimated tokens, parallel workers,
  and paid spend, where paid spend defaults to zero.
- `continuation`: whether a paused sign-in or user-input state may resume.

#### WorkItem

- `workItemId`, `taskId`, `role`, `objective`, `dependencies`.
- `ownedPaths` and `readOnlyPaths`.
- `requiredCapabilities`: language, test, browser, API, or host capability.
- `workerClass`: local, API, browser, optional Devin, reviewer, or integrator.
- `attempt`, `deadline`, and remaining budget reservation.
- `state`: queued, dispatched, running, paused, succeeded, failed, cancelled,
  blocked, or superseded.

#### WorkerResult

- `status`, `summary`, `patchRef`, `changedPaths`, and `testEvidence`.
- `routeId`, provider, transport, model/host authority, and attribution badge.
- `usage`: estimated tokens, elapsed time, retry count, and budget consumed.
- `failureClass`: unavailable, auth-required, quota, timeout, invalid-output,
  conflict, test-failure, policy-denied, or unknown.
- `userActionRequired`: a short safe instruction with no secret material.

#### ReviewResult

- `verdict`: approve, request-changes, reject, or needs-user-decision.
- Findings with severity, path, line, rationale, and suggested correction.
- Tests rerun, security checks, dependency review, and secret-scan result.
- Explicit statement of what was not verified.

### 4. Orchestration state machine

The task controller should make state transitions explicit and persist enough
metadata to recover after process interruption.

```text
INTAKE
  -> PREFLIGHT
  -> PLANNED
  -> WAITING_FOR_APPROVAL (only when required)
  -> DISPATCHING
  -> RUNNING
  -> PAUSED_FOR_USER (sign-in, API key, conflict, or decision)
  -> COLLECTING
  -> REVIEWING
  -> INTEGRATING
  -> VERIFYING
  -> COMPLETE

Any active state -> FAILED or CANCELLED
REVIEWING -> DISPATCHING only for a bounded repair item
INTEGRATING -> ROLLED_BACK on failed verification
```

Rules:

- A paused task consumes no worker budget while waiting for the user.
- A retry requires a new attempt record and a remaining budget reservation.
- A repair loop is limited to one or two cycles by default.
- A worker cannot transition another worker directly to complete.
- Only the integrator can modify the canonical checkout.
- Process restart must recover as paused or failed, never silently rerun paid
  or browser work.

### 5. Planner behavior

The planner is not a general autonomous agent with unrestricted repository
authority. It produces a plan that the controller validates.

Planner inputs:

- repository tree summary and relevant file excerpts;
- current branch/revision and dirty-worktree status;
- task objective and acceptance criteria;
- available worker capabilities and hard budget;
- project instructions such as `AGENTS.md`.

Planner outputs:

- 3–12 work items with dependency edges;
- path ownership and read-only requirements;
- commands each worker may run;
- expected artifacts and tests;
- uncertainty and clarification requests.

Planner validation rejects cycles, overlapping write ownership between parallel
items, missing dependencies, unbounded commands, unknown worker classes, and
plans that exceed the budget. If validation fails, show the plan and ask for a
decision instead of silently repairing it.

### 6. Parallelism policy

The initial safe profile should be:

- one planner;
- at most two implementation workers in parallel;
- one test worker after each implementation batch;
- one reviewer;
- one integrator;
- one repair cycle unless the user raises the limit.

Parallel work is allowed only when all of the following are true:

- owned write paths are disjoint;
- neither item depends on the other's output;
- both use the same base revision;
- combined reservations fit the remaining budget;
- neither item is modifying package manifests, lockfiles, migrations, or shared
  configuration without explicit serialization.

Serialize work on lockfiles, generated output, release metadata, installer
files, shared routing policy, and any file named by project instructions.

### 7. Worker packet design

Every worker receives a minimal packet:

- task objective and acceptance criteria;
- role and owned paths;
- relevant excerpts, interfaces, and test commands;
- base revision and workspace path;
- hard constraints and remaining budget;
- required output schema.

Never send the whole conversation, entire repository, environment dumps,
credentials, cookies, auth files, browser storage, unrelated private files, or
provider secrets. The worker must request more context through a bounded
controller operation if the initial packet is insufficient.

Worker output must be machine-validated. Reject prose-only success claims when
the worker was expected to return a patch or test evidence. Treat model output
as untrusted suggestions; the host validates paths, commands, diffs, and tests.

### 8. Devin integration options

There are three possible implementations, and they should not be conflated.

#### Option A — no Devin dependency, recommended first

Use OmniRoute's existing local/API/browser workers and implement the Fusion-like
task graph locally. This is the free-first baseline and works without a Devin
account.

#### Option B — optional actual Devin bridge

Add a provider-neutral remote worker adapter only after the supported Devin API,
authentication method, job lifecycle, callback/polling behavior, and usage
limits are confirmed. The bridge submits a sanitized task packet, polls status,
retrieves a patch/evidence bundle, and maps Devin failures into the common
`WorkerResult`. It must not assume that a browser UI is a stable API.

The bridge is disabled unless all of these are configured: explicit feature flag,
user-approved remote dispatch, Devin credential stored outside the repository,
per-task budget, and a valid project/repository mapping. A remote job may not
push or merge by default.

#### Option C — browser-driving Devin

Treat this as a last-resort diagnostic adapter, not the production path. It is
fragile, requires a user sign-in, may violate service terms, and cannot provide
the same reliable lifecycle guarantees as an API. Keep it separate from the
existing six consumer adapters and never claim it is equivalent to an official
Devin integration.

### 9. Budget accounting

Budget must be enforced before dispatch, not inferred after the fact.

Reserve cost for each work item before it runs. Track:

- host tokens used by the main agent;
- worker estimated/ reported tokens;
- browser calls and elapsed time;
- API requests and retries;
- remote Devin jobs and their reported cost, if enabled;
- synthesis and review calls;
- remaining per-window quota when available.

When a provider reports no usage, record `unknown`, never zero. When the weekly
window is near exhaustion, the controller should reduce parallelism, prefer
browser/free routes, pause before synthesis, or stop with a clear reason. It
must not switch to a paid provider silently.

### 10. Security and trust gates

Pre-dispatch:

- validate repository path and reject symlink/reparse escapes;
- load only approved project instructions;
- redact likely secrets from excerpts;
- verify worker capability and budget;
- display external/paid dispatch approval if applicable.

Post-worker:

- validate patch paths against `ownedPaths`;
- reject absolute paths, traversal, symlinks, binary surprises, and generated
  files outside the allowlist;
- scan diffs for keys, cookies, tokens, private URLs, and accidental profile
  data;
- run dependency and lockfile policy checks;
- require tests appropriate to the changed files.

Before integration:

- show the diff and review findings;
- require user approval for destructive changes, migration execution, commit,
  push, release upload, or remote job submission;
- checkpoint the canonical checkout.

### 11. Failure handling

Use typed failures and visible recovery actions:

- `AUTH_REQUIRED`: pause and ask the user to sign in or configure a key.
- `QUOTA_EXHAUSTED`: stop or choose an already-approved free route.
- `WORKER_TIMEOUT`: retry once only if budget remains.
- `INVALID_OUTPUT`: reject and request a corrected structured result.
- `PATCH_CONFLICT`: serialize the conflicting items or ask the user.
- `TEST_FAILURE`: create one bounded repair item with the failing evidence.
- `POLICY_DENIED`: stop; do not weaken the policy automatically.
- `REMOTE_UNAVAILABLE`: fall back only to an already-approved local route.

All failures should be resumable where safe. Do not automatically replay a
browser prompt or remote job after a process restart unless the user explicitly
chooses resume.

### 12. Test and evaluation matrix

Unit tests:

- schema validation and unknown-field rejection;
- dependency DAG cycle detection and deterministic ordering;
- overlapping path ownership;
- budget reservation, refund, exhaustion, and unknown usage;
- max parallelism and cancellation;
- state transition legality and restart recovery;
- secret redaction and path validation;
- paid-route opt-in and no-paid-fallback behavior.

Integration tests:

- two disjoint workers produce compatible patches;
- two workers conflict and are not auto-integrated;
- worker failure leaves canonical checkout unchanged;
- reviewer rejection creates a bounded repair item;
- test failure is attached to the correct work item;
- browser sign-in pauses without treating the task as failed;
- missing Devin configuration cleanly uses local/API workers;
- remote adapter timeout never blocks unrelated local cleanup.

Distribution tests:

- fresh Windows/Linux install and rerun;
- package manifest and checksum verification;
- foreground six-browser startup and explicit background override;
- existing profile/config preservation;
- disabled Devin feature by default;
- no account/session data in archives;
- upgrade, rollback, and uninstall boundaries.

Evaluation tasks:

- isolated documentation change;
- disjoint frontend/backend change;
- shared lockfile change requiring serialization;
- failing test requiring one repair cycle;
- security-sensitive change requiring reviewer rejection;
- quota exhaustion mid-task;
- user pause for browser sign-in;
- cancelled task followed by clean resume.

Record completion rate, test pass rate, invalid patch rate, human interventions,
wall-clock time, worker calls, estimated tokens, and paid spend. Do not use a
small number of successful demos as evidence of Devin parity.

### 13. Release sequence

1. Merge contract and controller behind a disabled feature flag.
2. Run unit/integration tests with fake workers only.
3. Enable local/API workers in an opt-in developer build.
4. Add browser workers with foreground diagnostics and explicit sign-in pauses.
5. Add optional actual Devin transport only after API verification.
6. Run extracted package tests on Windows and Linux separately.
7. Publish documentation and source first.
8. Publish a binary only after reproducible build inputs, manifests, checksums,
   and foreground behavior are verified.

At every stage, keep the previous runtime version available for rollback.

## Expanded next-session implementation prompt

```text
You are implementing the plan in
plans/devin-fusion-free-local-plan.md for the OmniRoute source repository.
First read the entire plan, the repository AGENTS.md instructions, and the
existing routing, MCP, observability, browser-adapter, distribution, and test
seams named in the plan. Do not implement from assumptions.

This is a staged implementation. Implement only Steps 1 and 2 in the first
turn: the validated worker/task/result contracts, task-graph planner output,
dependency and file-ownership validation, explicit state machine, and hard
budget controller. Keep the feature disabled by default. Do not add an actual
Devin API bridge yet, do not browser-drive Devin, and do not change the current
regular router behavior.

Use existing contracts and attribution where possible. Do not create a second
credential store, provider router, or audit system. Never send credentials,
cookies, browser storage, auth files, or unrelated private context to any
worker. Reject unsafe paths, symlinks, traversal, overlapping parallel writes,
cycles, unbounded retries, unknown worker classes, and silent paid fallbacks.

Before editing, report the exact files you intend to touch and any uncertainty.
Then write tests first for schema validation, DAG cycles, deterministic
ordering, overlapping ownership, budget reservation/exhaustion, max
parallelism, cancellation, legal state transitions, and disabled-by-default
paid/Devin routes. Implement the smallest production design that passes those
tests.

The controller must stop before dispatch when a budget reservation does not fit.
Unknown provider usage must be recorded as unknown rather than zero. A paused
sign-in or user-input state must consume no worker budget and must not be
silently replayed after restart. Only a later integrator stage may edit the
canonical checkout; this first slice may use fake workers and must not modify
the user's live checkout or host credentials.

Run the narrowest relevant tests, then existing regular/security tests if the
dependencies are available. If the repository cannot build, stop and report
the exact missing input instead of installing arbitrary dependencies or
publishing an artifact. Do not push, create a PR, upload a release, dispatch a
remote Devin job, or use paid APIs without explicit approval.

End with: files changed, tests run and exact results, contract decisions,
remaining risks, budget impact, and a proposed Step 3 implementation slice.
```
