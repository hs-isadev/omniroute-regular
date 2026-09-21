# OmniRoute full Fusion implementation prompt — Terra

You are implementing the complete OmniRoute upgrade in the existing
repository. Use **GPT-5.6 Terra** for this implementation. This prompt is
architecture-first and includes the core reliability fixes plus the optional
Devin-Fusion-like control-plane features.

## Mandatory model gate

Before doing any work, identify the actual model running this chat. If it is
not GPT-5.6 Terra, stop immediately and tell the user:

`This implementation requires GPT-5.6 Terra. I am <actual model>, so I am stopping.`

Then provide this complete prompt again. Do not silently substitute GPT-6
Astra or GPT-5.6 Sol. This gate applies to the implementation host model; it
does not prevent the finished OmniRoute product from routing eligible runtime
requests to other verified providers.

## Working rules

Read every applicable `AGENTS.md` file first. Inspect the current source,
tests, provider catalog, routing, MCP server, OpenCode integration, Antigravity
integration, browser consumers, startup installers, package scripts, and
download artifacts before editing. Preserve unrelated user changes. Never add
credentials, cookies, sessions, browser profiles, or private workspaces to Git
or packages.

Implement the work in ordered phases in one task, but stop at each phase's
acceptance gate before starting the next. Do not make a giant unverified diff.
Report changed files and test results after every phase.

## Product goal

Make OmniRoute the single MCP-addressable control plane for a legitimate
BYOK/free-tier/local-model coding setup on Windows and Linux.

The permanent architecture must survive the removal of any individual model,
provider, gateway, CLI, browser consumer, or temporary promotion. Union Alpha
is only a temporary opportunity. Discover it dynamically when available, use it
when eligible, and prove that removing it does not break the system.

The final flow should be:

`MCP client -> durable task -> live model selector -> minimal context -> one approved executor/provider -> verification -> bounded repair -> report`

## Non-negotiable safety boundaries

Do not implement or suggest:

- duplicate account creation;
- VM, account, IP, proxy, or browser-profile rotation to evade quotas;
- CAPTCHA or challenge bypass;
- cookie, session, local-storage, or auth-database extraction;
- credential injection into Cline, Aider, OpenHands, Goose, Kilo, OpenCode,
  9Router, LiteLLM, or other tools' private storage;
- silent paid fallback, automatic billing, or top-ups;
- automatic Git push, merge, publication, or third-party account changes.

Unknown price, quota, capability, privacy, terms, authorization, or gateway
ownership must fail closed in free-only mode.

## 1. Maximum practical OmniRoute utilization

Make OmniRoute the default first worker for nearly every ordinary project task:

- repository inspection;
- code search;
- architecture discussion;
- coding analysis;
- implementation planning;
- debugging;
- test analysis;
- review;
- documentation;
- package analysis;
- bounded code-generation work.

Automatically dispatch eligible work through `omni_route` with
`routingMode=regular`; do not require the user to request delegation each
time. Use one capable worker for the primary answer. Use a second sequential
worker only for independent review, failed verification, or clearly separate
read-only analysis. Never create an unbounded swarm.

Send relevant source code, tests, configuration shape, logs, constraints, and
acceptance criteria. Never send credentials, cookies, authentication files,
browser profiles, private account data, or unrelated personal files.

The host remains responsible for filesystem edits, credentials, approvals,
destructive commands, third-party actions, and final verification. Return
compact worker results by default: answer, changed-file suggestions,
verification result, attribution badge, route ID, and concise failure details.

## 2. Live provider/model selection

Create a normalized provider/model registry containing:

- provider and model IDs;
- transport and endpoint class;
- credential reference;
- free/BYOK/paid status;
- price and quota evidence;
- privacy and terms metadata;
- context and output limits;
- reasoning, vision, coding, tool-calling, and structured-output support;
- health, latency, cooldown, concurrency, and task-class eligibility;
- discovery timestamp and evidence expiry.

Add live discovery with TTLs and documented synthetic health/capability probes.
Temporary models must be addable or removable without a code release.

The selector must filter candidates by task requirements, authorization,
privacy, free/BYOK policy, context, tools, health, quota, and budget. Score
eligible candidates by capability fit, reliability, price evidence, quota
headroom, context/output fit, privacy, latency, and concurrency.

Prefer OpenCode Zen `union-alpha` only when live discovery confirms it is
currently free, healthy, authorized, and capable. Otherwise select the best
current free OpenCode Zen model, `openrouter/free`, another verified free
provider, authorized BYOK, or a suitable local model.

Never assume that `openrouter/free` identifies a fixed underlying model. Record
the actual route and model identity whenever the provider reports it.

Reject blocked candidates such as models returning organization-level 403
errors instead of retrying them forever. Implement cooldowns, Retry-After,
circuit breakers, bounded retries, deterministic tie-breaking, and loop
detection for OmniRoute -> gateway -> OmniRoute.

## 3. OpenCode host-model integration

OpenCode must use one host model selected from the live registry. Do not allow
stale model IDs, hidden provider fallback, silent paid fallback, or a second
routing authority.

Prefer `opencode/union-alpha` only while eligible. Otherwise use the strongest
currently verified free OpenCode Zen model or another approved route.

Preserve existing OpenCode settings. Do not inject OmniRoute credentials into
private OpenCode storage. Make selected provider, model, route, and fallback
reason observable.

## 4. Durable Fusion task state

Add a versioned durable task envelope containing:

- task ID and parent ID;
- objective and constraints;
- relevant context references;
- required capabilities;
- approved tools;
- selected route;
- budget and stop conditions;
- acceptance criteria;
- state and attempt number;
- events and timestamps;
- artifacts;
- verification results;
- redacted errors.

Support these states:

`queued`, `planning`, `executing`, `verifying`, `repair`,
`paused-for-approval`, `completed`, `failed`, `cancelled`, and `blocked`.

Validate transitions. Make writes atomic. Recover after interruption. Prevent
duplicate external side effects with idempotency checks. Do not add a hidden
planner or unbounded background swarm.

## 5. Minimal-context planning

For each task, produce only the necessary subtasks, dependencies, acceptance
checks, relevant files/symbols, tool permissions, capability requirements,
budgets, and stop conditions.

Add repository-map and symbol-aware context selection, repeated-content
deduplication, bounded command-output and diff compression, and preservation of
structured tool-call history.

Use sequential execution by default. Allow parallelism only for independent,
read-heavy work under a small configured limit. Small tasks must not receive
whole-repository context unnecessarily.

## 6. Controlled executors

Implement a common executor interface for OpenCode, documented CLI/SDK/MCP/ACP
tools, local models, and browser consumers.

Each executor must declare capabilities, credentials required, workspace scope,
command allowlist, environment allowlist, timeout, concurrency, side-effect
class, cancellation support, and output format.

Return exit status, redacted stdout/stderr, changed paths, diff, test results,
usage, route/model attribution, and structured errors.

Use approved workspaces or disposable worktrees. Stop on timeout, cancellation,
challenge, auth failure, malformed output, scope violation, or unapproved
external side effect.

## 7. MCP front door and verification

Extend the existing MCP server without breaking the regular `omni_route`
contract. Add typed operations for submit, status, inspect plan, approve,
pause, resume, cancel, inspect diff, verify, and retrieve a redacted report.

Verification must use only relevant checks: focused tests, integration tests,
type/lint checks, diff inspection, package smoke checks, startup checks,
route attribution, and secret redaction.

Permit at most one bounded automatic repair attempt per subtask. After failure,
pause or fail with evidence. Never loop indefinitely.

## 8. Six foreground browser consumers

Support six user-authenticated browser consumer adapters using dedicated
profiles and documented loopback-only control.

Keep them foreground for sign-in and diagnostics. Browser sign-in remains a
normal user action. Never read cookies, local storage, login databases, or
private auth files.

When the user enables start-on-boot, launch all six adapters in the foreground
at every Windows login or Linux session start.

Use one idempotent managed startup registration. Do not create duplicate
entries. Remove stale `.backup-*` files and prevent future backup artifacts in
Startup/autostart directories.

Serialize requests, enforce spacing and rolling budgets, restrict browser work
to small tasks, and stop on challenge, verification, throttling, policy notice,
auth failure, or unknown model/quota.

## 9. Windows/Linux one-click setup

Provide one-click setup with native Windows and Linux paths, quoting,
permissions, processes, environment handling, archives, upgrades, rollback,
repair, uninstall, and migration.

Keep exactly three interactive checkpoints:

1. browser consumer sign-ins;
2. entering the user's own BYOK keys;
3. installing/signing in to the user's own Antigravity app/account.

Explain and pause at those checkpoints. Never automate account creation or
scrape browser sessions. Antigravity remains external and its credentials/data
root must not be bundled or overwritten.

Make reruns idempotent. Preserve unrelated settings. Provide dry-run and
repair paths. Never silently enable billing or paid routes.

## 10. Source and download packages

Build clean Windows and Linux source/download packages containing only intended
runtime assets.

Include manifests, version/build metadata, SHA-256 checksums, install,
upgrade, rollback, migration, and uninstall instructions, free/BYOK policy,
provider discovery behavior, Union Alpha expiration behavior, browser startup
behavior, and known limitations.

Exclude credentials, browser profiles, sessions, private workspaces, logs,
caches, temporary files, and backup artifacts.

## 11. Tests and evaluation

Add focused tests for:

- task state transitions and crash recovery;
- capability and price gating;
- temporary model removal;
- Union Alpha availability and fallback;
- blocked-provider filtering and 403 cooldown;
- Retry-After and circuit breakers;
- routing-loop detection;
- compact worker output;
- OpenCode host-model selection;
- command and workspace allowlists;
- cancellation and malformed output;
- browser serialization and challenge stop;
- startup idempotency and backup cleanup;
- credential redaction;
- Windows/Linux setup and rollback;
- package contents and checksums;
- one-orchestrator/no-hidden-planner behavior.

Measure first-pass success, verification success, repair count, total calls,
token usage, host-token avoidance, latency, provider errors, attribution,
package size, and setup duration.

## Implementation order

Implement in this order and stop at each acceptance gate:

1. inspect current architecture and create a requirements-to-code matrix;
2. implement durable task state;
3. implement live provider/model discovery;
4. implement dynamic route selection and budgets;
5. implement minimal-context planning;
6. implement executors and OpenCode host-model selection;
7. implement MCP lifecycle and verification;
8. implement six foreground browser consumers and startup cleanup;
9. implement Windows/Linux one-click setup;
10. build and test source/download packages;
11. run final security, regression, and clean-profile release checks.

## Delivery rules

For every phase:

1. inspect before editing;
2. report relevant current implementation and risks;
3. implement only that phase;
4. add focused tests;
5. run focused tests before broad tests;
6. inspect the diff for secrets, paid fallbacks, routing loops, duplicate
   startup entries, and unrelated changes;
7. report changed files, commands/results, limitations, and artifacts;
8. do not push, publish, merge, or modify third-party accounts without
   explicit approval.

If Union Alpha disappears, the system must continue using the next eligible
route without a code change.
