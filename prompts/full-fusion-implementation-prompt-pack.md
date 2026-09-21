# OmniRoute Full Devin-Fusion Upgrade: staged implementation prompt pack

Use these prompts in order in a fresh coding-agent chat. Paste the **Global
Preamble** first, then paste one phase prompt at a time. Do not ask the agent to
implement every phase in one response. Each phase must inspect the current
repository, preserve existing user changes, make a bounded diff, run focused
verification, and report what remains.

This pack is intentionally architecture-first and implementation-oriented, not
a one-time automation script or a temporary model integration. It defines a
durable control plane whose provider catalog, model selector, executor
contracts, task state, verification loop, installers, and documentation remain
useful when any individual model, gateway, CLI, browser consumer, or promotion
disappears. It still uses staged gates so a failure in packaging, credentials,
or browser automation cannot silently invalidate the rest of the release.

The implementation must make provider/model churn normal. Union Alpha is a
short-lived free opportunity, not a platform dependency: use it while live
evidence says it is eligible, but prove that removing it from the catalog leaves
the architecture and user workflow intact. Do not scatter `union-alpha` across
business logic, installer code, tests, or permanent defaults.

## Model policy

Use the first eligible option in this order for each phase:

1. **Union Alpha through OpenCode Zen** (`opencode/union-alpha` in OpenCode
   configuration; `opencode-zen` / `union-alpha` in the OmniRoute registry),
   but only when live discovery confirms it is available, healthy, free, and
   supports the required capabilities. Treat it as an expiring catalog entry,
   never as a permanent dependency or hardcoded default.
2. The strongest other currently free OpenCode Zen coding model discovered at
   runtime, such as `big-pickle`, `mimo-v2.5-free`, or a newer free model.
3. `openrouter/free` or another directly verified free route with the required
   tool-calling and structured-output capabilities.
4. **GPT-5.6 Luna** for small, mechanical, platform-specific, documentation,
   and test-maintenance work when the free routes are unavailable.
5. **GPT-5.6 Sol only as a conditional escalation** for an unresolved
   architecture conflict, repeated integration failure, or final security/
   release gate. Do not use Sol by default.

**GPT-6 Astra is deliberately excluded from this plan.** Do not select it,
recommend it, or silently fall back to it.

The model name is never enough to prove quality. The implementation must query
the live catalog, verify price and quota policy, verify health and capabilities,
and record the actual provider/model/route attribution. An alias such as
`openrouter/free` must not be reported as a fixed underlying model.

OpenCode's official Zen catalog currently lists Union Alpha as a temporary free
model with reasoning and a 262K context window, but availability can change.
The live catalog is authoritative: <https://opencode.ai/docs/zen>.

## Global Preamble — paste this before every phase

```text
You are implementing the OmniRoute full Fusion upgrade in the existing source
repository. Work only in the repository I provide. Read the applicable
AGENTS.md files before editing. Inspect current code, tests, package scripts,
provider catalog, routing, MCP integration, browser consumers, OpenCode
integration, Antigravity integration, installers, and distribution scripts
before choosing a design. Preserve unrelated user changes and credentials.

Product goal: make OmniRoute the single MCP-addressable control plane for a
Devin-Fusion-like coding workflow while remaining a legitimate BYOK/free-tier/
local-model product. It must select the best currently eligible route for each
task, use only the tools and context needed for that task, execute bounded work,
verify the result, recover from ordinary failures, and stop when acceptance
criteria pass. It must reduce unnecessary host-token use without creating an
unbounded swarm or hidden planner.

Required product behavior:
- Support Windows and Linux from the same source design, with native path,
  process, service, environment, permissions, and archive handling on each.
- Produce a downloadable package and source package with reproducible build
  metadata, checksums, release notes, and an upgrade/migration path.
- Make setup one-click after the user's three explicit exceptions: browser
  consumer sign-ins, entering the user's own API keys (BYOK), and installing/
  signing in to the user's own Antigravity account/app. The installer must
  explain and pause at those checkpoints instead of pretending to automate them.
- Never create duplicate provider accounts, rotate accounts/VMs/IPs/proxies,
  bypass CAPTCHA or challenges, extract cookies/session databases, or evade
  quotas, rate limits, or provider terms.
- Keep credentials in OS-appropriate secure storage or environment references;
  never commit, package, log, or send them to workers. Never read another
  application's private credential store.
- Support user-authorized API providers, local models, documented CLI/SDK/MCP/
  ACP executors, and foreground browser consumer adapters. Treat Cline, Aider,
  OpenHands, Goose, Kilo, OpenCode, and similar tools as executors or gateways,
  not automatically as model providers.
- Keep one routing authority per request. OmniRoute owns admission, selection,
  fallback, budgets, attribution, and stop conditions. If OpenCode, 9Router,
  LiteLLM, or another gateway is used upstream, disable its competing hidden
  fallback and detect OmniRoute-to-gateway routing loops.
- At setup, discover current provider/model metadata. Select the strongest
  eligible option based on required capabilities, health, known free/BYOK
  price, quota headroom, context/output limits, privacy, reliability, and
  latency. Do not select by model-name prestige alone.
- Prefer OpenCode Zen Union Alpha (`union-alpha`) when live discovery confirms
  it is available and free. If not, automatically choose the best currently
  eligible free OpenCode Zen route, then OpenRouter free or another approved
  route. Do not hardcode Union Alpha as permanently available.
- OpenCode must have a host model selected by this live capability/health
  process. It must not silently use a paid model, nested fallback, or a stale
  model id. The chosen route and actual model identity must be observable.
- When the user enables browser start-on-boot, launch all six configured
  browser consumer adapters in the foreground at every login, with an
  idempotent single startup registration and no backup files in the Startup
  directory. Keep requests serialized, small-task-only, paced, and stoppable
  on sign-in challenges, verification, throttling, policy notices, or auth
  failure. Browser sign-in remains manual and foreground.
- Provide durable task state, bounded decomposition, per-task acceptance
  criteria, minimal context/tool selection, typed tool envelopes, execution
  timeouts, cancellation, one bounded repair attempt, verification, usage and
  route attribution, crash recovery, and useful logs/telemetry without leaking
  secrets or full private prompts.
- Package a clean install, safe rerun, upgrade, rollback, uninstall plan, and
  migration for existing installs. Do not delete unrelated user data.

Security and scope boundaries:
- Fail closed on unknown price, quota, tool support, privacy, provider terms,
  model capability, or gateway ownership.
- No silent paid fallback or automatic billing/top-up.
- No automatic Git push, merge, publication, or third-party account changes.
- External side effects require explicit user approval.
- Use disposable worktrees or an approved workspace for coding executors.
- Redact secrets from logs, diffs, diagnostics, crash reports, and package
  manifests.
- Do not send credentials, cookies, authentication files, or unrelated private
  data to any worker.

Delivery protocol for this phase:
1. First report the relevant current implementation and risks in concise form.
2. Implement only this phase and its directly required interfaces.
3. Add or update focused tests before broad refactors.
4. Run the smallest relevant tests, type checks, lint, and package checks.
5. Inspect the diff for secrets, stale instructions, hidden paid paths,
   duplicate startup entries, and unintended files.
6. Stop after the acceptance criteria pass. Do not begin later phases.
7. Report changed files, commands/results, known limitations, and the next
   phase's prerequisites. Do not claim a provider or package is working unless
   it was actually verified.
```

## Phase 0 — baseline inventory and contract freeze

**Recommended model:** GPT-5.6 Luna. Use Union Alpha instead if it is already
connected and the task requires broad repository reasoning. Do not use Sol for
this inventory.

```text
Using the Global Preamble, perform a complete read-only baseline inventory.
Do not implement features yet. Map the existing packages, entrypoints,
provider/model registry, routing decisions, MCP server, OpenCode integration,
Antigravity integration, browser consumers, startup installers, Windows/Linux
packagers, tests, docs, and current download artifacts.

Produce a requirements-to-code matrix showing what already exists, what is
partial, what is stale, and what is missing for the full Fusion upgrade. Identify
the smallest compatible extension points and any conflicting instructions. Add
or update a checked-in architecture/acceptance document only if the repository
already uses that documentation pattern; otherwise return the proposed matrix
without broad edits.

Acceptance criteria: every required product behavior has a named source path or
an explicit missing implementation; package/build/test entrypoints are listed;
the next phases have dependency order and risk notes. Do not change provider
configuration or credentials.
```

## Phase 1 — durable Fusion task model and lifecycle

**Recommended model:** Union Alpha if discovered healthy/free; otherwise the
strongest eligible free OpenCode Zen coding model. Conditional Sol escalation
only if the state-machine design has an unresolved cross-package conflict.

```text
Using the Global Preamble and the Phase 0 inventory, implement the canonical
Fusion task lifecycle. Add a durable, versioned task envelope with task id,
parent id, objective, constraints, relevant context references, selected route,
tool permissions, acceptance criteria, budget, status, attempt number, events,
artifacts, verification results, and redacted error state.

Implement explicit states for queued, planning, executing, verifying, repair,
paused-for-approval, completed, failed, cancelled, and blocked. Make writes
atomic and recoverable after process interruption. Preserve backwards
compatibility with existing request paths and do not introduce a second planner
or a background swarm.

Acceptance criteria: interrupted tasks recover without duplicate side effects;
invalid transitions are rejected; secrets are absent from persisted state and
logs; focused unit tests cover transitions, cancellation, recovery, and schema
versioning. Return the state/event interface that later executor phases must
use.
```

## Phase 2 — live provider/model discovery and capability registry

**Recommended model:** GPT-5.6 Luna. Use Union Alpha only for difficult
provider-schema work; do not spend Sol here.

```text
Implement the live provider/model registry required by the Global Preamble.
Normalize each candidate into provider, model, transport, endpoint class,
credential reference, price/free evidence, quota evidence, privacy label,
terms URL, context/output limits, reasoning, vision, coding, tool-calling,
structured-output, health, cooldown, concurrency, and allowed task class.

Add TTL-based discovery and synthetic capability/health probes where documented
and permitted. Add the OpenCode Zen live catalog path and recognize
`union-alpha` without assuming it remains available. Preserve the existing
Big Pickle, MiMo, Nemotron, direct OpenRouter, local, and BYOK records where
valid. Unknown values must remain unknown and fail closed under free-only mode.

Acceptance criteria: a fresh catalog can add/remove temporary free models
without a code release; Union Alpha is eligible only when live evidence passes;
paid or unknown candidates cannot enter a free-only route; tests cover stale
metadata, capability mismatch, provider cooldown, and secret-free diagnostics.
```

## Phase 3 — best-current-route selector and budget controller

**Recommended model:** Union Alpha if available; otherwise the strongest free
coding model with verified tool calling and structured output. Use Sol only if
the selector has an unresolved correctness conflict after focused tests.

```text
Implement the single routing authority for Fusion tasks. Given task class,
required tools, context size, privacy class, free-only/BYOK policy, budget,
quota headroom, and latency target, filter ineligible routes and score the
remaining candidates by required capability, health/reliability, known price
policy, quota headroom, context/output fit, privacy, and latency. Make the
scoring explainable and deterministic for equal evidence.

Use Union Alpha as the preferred OpenCode Zen candidate only when the Phase 2
registry proves it is current, free, healthy, and capable. Otherwise choose the
best live candidate, not a hardcoded alias. Add bounded retry/cooldown,
Retry-After handling, circuit breakers, route attribution, and host-token
budget accounting. Prevent nested OmniRoute -> gateway -> OmniRoute loops.

Acceptance criteria: every selection records why candidates were admitted or
rejected; no paid/unknown route is silently selected; one request has exactly
one routing owner; route/model/provider attribution survives retries and
partial streams; tests cover capability filtering, free-only fail-closed,
quota exhaustion, loop detection, and deterministic tie-breaking.
```

## Phase 4 — minimal-context planner and bounded decomposition

**Recommended model:** Union Alpha, because this phase needs long-context
reasoning and coding judgment. Do not invoke multiple planners in parallel.

```text
Add the Fusion planning loop on top of the Phase 1 task model and Phase 3
selector. For each request, produce a short plan containing only the necessary
subtasks, dependencies, acceptance checks, tool permissions, relevant file or
symbol slices, model capability requirements, and per-subtask budgets.

Implement repository-map and symbol-aware context selection, repeated-content
deduplication, bounded command-output/diff compression, and preservation of
tool-call history. Use sequential execution by default; permit parallelism only
for independent, read-heavy subtasks under a small configurable limit. Refuse
or split tasks that exceed context, time, tool, privacy, or budget limits.

Acceptance criteria: a task receives no unrelated credentials, files, or tools;
the planner creates no unnecessary worker; dependencies and acceptance checks
are explicit; compressed context preserves structured tool calls; tests show
that small tasks use smaller context and fewer calls than whole-repository
prompts without changing required behavior.
```

## Phase 5 — executor adapters and OpenCode host-model integration

**Recommended model:** Union Alpha through the OpenCode route, with the
OpenCode adapter itself configured to use the live-selected host model. Use
Luna for mechanical adapter/test fixes. Never use Astra.

```text
Implement the controlled executor layer for one task at a time. Start with the
documented OpenCode CLI/SDK/MCP/ACP interface already present in the repository,
then add one optional Cline or Aider executor only if its documented interface
is already available and the Phase 0 inventory confirms it is worthwhile.

OpenCode must use one host model selected from the live registry. Prefer
`opencode/union-alpha` when currently free and eligible; otherwise select the
best verified free OpenCode Zen or direct route. Do not embed a private session,
credential store, or hidden provider fallback. OmniRoute remains the outer
routing authority, and gateway loops are rejected. Pass only the approved
workspace, command allowlist, environment allowlist, tool permissions, task
budget, and minimal context.

Capture exit status, stdout/stderr with secret redaction, changed paths, diff,
tests, route/model attribution, and reported usage. Use disposable worktrees
where supported. Stop on timeout, challenge, auth failure, malformed output, or
unapproved external side effect.

Acceptance criteria: OpenCode's host model is observable and dynamically
selected; an executor cannot read another tool's private credentials; a bounded
coding task can edit and verify an approved workspace; tests cover allowlists,
timeouts, cancellation, malformed output, diff capture, attribution, and
nested-routing rejection.
```

## Phase 6 — MCP front door, approvals, verification, and repair loop

**Recommended model:** Union Alpha for implementation and reasoning. Sol is an
optional final reviewer only if the verification/approval design remains
ambiguous after tests.

```text
Expose the Fusion lifecycle through the existing MCP server without breaking
the current regular `omni_route` contract. Add typed operations for submit,
status, pause/resume, approve, cancel, inspect plan, inspect diff, verify, and
retrieve a redacted report. Keep the host responsible for approvals and final
external actions.

Implement verification as explicit acceptance checks: focused tests, type/lint
checks where applicable, diff inspection, package smoke checks, and provider/
route attribution checks. Permit at most one bounded automatic repair attempt
per subtask, then pause or fail with actionable evidence. Preserve partial
results and recoverable state. Do not add an unbounded autonomous loop.

Acceptance criteria: an MCP client can submit a bounded task, observe state,
approve a permitted action, inspect the diff, run verification, and receive a
final report; dangerous/external actions pause for approval; failed repairs do
not loop; tests cover approval races, cancellation, recovery, verification
failure, and redacted reports.
```

## Phase 7 — browser consumer adapters and foreground startup

**Recommended model:** GPT-5.6 Luna. This is bounded platform/adapter work and
does not justify Sol or Astra.

```text
Complete the six browser consumer adapters as opt-in, user-authenticated,
foreground executors. Use dedicated profiles and loopback-only CDP or the
documented browser interface. Never read cookies, local storage, browser login
databases, or private auth files. The user must sign in normally in the
foreground.

Implement an explicit start-on-boot setting. When enabled by the user, launch
all six configured adapters in the foreground at every Windows login or Linux
session start, with one idempotent registration, stable logs, clean shutdown,
and no `.backup-*` or other non-launchable artifacts in Startup/autostart
directories. When disabled, remove only OmniRoute's own managed registration.
Do not duplicate entries on rerun or upgrade.

Serialize browser requests, enforce spacing and rolling budgets, restrict them
to small tasks, and stop on challenge, verification, throttle, policy notice,
auth failure, or unknown model/quota. Report model identity and quota as
unknown when the browser UI does not prove them.

Acceptance criteria: clean install, rerun, upgrade, disable, and rollback leave
no duplicate startup entries; six enabled adapters open foreground on the next
login; a stale backup file cannot trigger an app-picker popup; tests cover
serialization, challenge stop, profile isolation, redaction, and Windows/Linux
startup behavior.
```

## Phase 8 — BYOK, Antigravity, and one-click setup

**Recommended model:** GPT-5.6 Luna for implementation. Use Sol only as a
conditional security reviewer if a credential-handling issue cannot be
resolved by tests and documented platform APIs.

```text
Implement the cross-platform one-click setup and upgrade flow. It must install
the bundled/pinned runtime and OmniRoute source components, detect prerequisites,
create safe per-user directories, configure MCP and OpenCode integration,
discover eligible providers, validate configuration, create managed startup
entries when selected, and produce a clear success report.

Keep exactly three interactive checkpoints: (1) the user signs in to each
browser consumer in the foreground, (2) the user enters or selects their own
BYOK credentials, and (3) the user installs/signs in to their own Antigravity
app/account. Do not automate account creation, bypass sign-in, or scrape
browser sessions. Antigravity must remain an external prerequisite and its
credentials/data root must not be bundled or overwritten.

Support PowerShell/Windows and Bash/Linux with native quoting, paths,
permissions, process cleanup, uninstall, safe rerun, upgrade, rollback, and
failure recovery. Preserve unrelated user config and show a dry-run/repair
path. Store only references or encrypted values in OS-appropriate storage.

Acceptance criteria: a clean Windows and Linux profile can complete setup with
one click plus the three checkpoints; rerun is idempotent; missing keys/sign-in
are clearly actionable; no credential/session appears in logs or archives; the
installer never silently enables a paid route; smoke tests cover spaces in
paths, interrupted setup, rollback, and existing-config preservation.
```

## Phase 9 — package, download artifact, and source release

**Recommended model:** GPT-5.6 Luna. Use a free OpenCode model for broad
release reasoning only if Luna lacks context; do not use Sol by default.

```text
Finish the Windows and Linux distribution pipeline for the completed Fusion
features. Build the source package and downloadable archives from a clean
checkout, include only intended runtime assets, and exclude credentials,
browser profiles, private workspaces, logs, caches, temporary files, and backup
artifacts.

Add reproducible version/build metadata, SHA-256 checksums, package manifests,
platform-specific install/launch/rollback instructions, migration notes,
known limitations, the three interactive setup checkpoints, free/BYOK policy,
provider discovery behavior, and foreground browser startup behavior.

Validate installation into paths containing spaces, safe rerun, upgrade,
rollback, clean uninstall, Windows PowerShell parsing, Linux permissions,
runtime availability, MCP connection, OpenCode host-model selection, and
browser startup registration without making a live provider request unless a
user explicitly performs one.

Acceptance criteria: source and download packages are clean and checksummed;
both platforms have a documented install and rollback path; package contents
contain no secrets or personal state; clean-profile smoke tests pass; release
artifacts are ready for review but are not pushed or published automatically.
```

## Phase 10 — evaluation, security audit, and final release gate

**Recommended model:** Union Alpha for the evaluation implementation. Run the
final security/release review with Luna first; invoke Sol only if Luna reports
an unresolved high-risk architectural or security conflict. Never use Astra.

```text
Run the final full-system evaluation without broadening product scope. Create
or update deterministic fixtures for small, medium, and large coding tasks;
provider outage/cooldown; unknown pricing; malformed tool calls; partial
streams; cancellation; crash recovery; browser challenge; BYOK omission;
Windows/Linux setup; OpenCode Union Alpha availability and fallback; package
upgrade/rollback; and secret redaction.

Measure first-pass success, verification success, repair count, total calls,
input/output/cache tokens when available, host-token avoidance, latency,
provider errors, route attribution, and package size. Confirm that Fusion saves
work rather than increasing total calls through unnecessary planning or review.

Perform a security and release audit for credential leakage, private-profile
access, command injection, path traversal, destructive actions, hidden paid
fallback, quota evasion, duplicate startup entries, routing loops, stale docs,
and accidental files. Fix only release-blocking defects found by the audit.

Acceptance criteria: the full focused and regression suites pass or have
explicit documented failures; every enabled route has current evidence and
attribution; no high-risk security finding remains; Windows/Linux packages
pass clean-profile smoke tests; the final report lists exact artifacts,
checksums, limitations, and any user approvals still needed. Do not push,
publish, or modify third-party accounts without explicit approval.
```

## Optional conditional Sol review prompt

Use this only when a phase reports a genuine unresolved blocker after focused
tests. It is deliberately not a normal phase.

**Model:** GPT-5.6 Sol. **Never Astra.**

```text
Review the attached phase diff, focused test output, architecture notes, and
reported blocker. Do not implement unrelated features. Determine whether the
blocker is a real correctness/security/reliability issue or a solvable local
defect. Propose the smallest safe correction, identify affected acceptance
criteria, and specify the exact tests that should pass afterward. Do not access
credentials, private browser state, or external accounts. Return a concise
decision and patch guidance for the primary implementation model.
```

## How to run the pack

Start with Phase 0, then proceed only when its report is clear. At every phase,
paste the Global Preamble followed by the phase prompt. If the agent tries to
skip inspection, select a paid route, automate account sign-in, create a second
routing authority, rotate accounts/VMs, or edit unrelated files, stop it and
return to the previous phase's acceptance criteria.

The primary design assumption is:

`MCP client -> OmniRoute Fusion task -> live selector -> one executor/provider -> verification -> report`

OpenCode, 9Router, LiteLLM, Cline, Aider, and browser consumers remain
replaceable edges behind that control plane. They do not become competing
planners or hidden quota multipliers.

## Mandatory model gate

Before doing any work for a phase, identify the actual model currently running
the chat and compare it with that phase's **Recommended model**. If you are not
the model listed for that specific phase, stop immediately. Do not inspect files,
edit code, spend tokens on implementation, or silently substitute another
model. Tell the user:

`This phase requires <recommended model>. I am <actual model>, so I am stopping.`

Then provide the complete next phase prompt, including the Global Preamble, in
the correct order. If the phase allows a conditional fallback, use it only when
the prompt explicitly says that fallback is allowed and the required evidence
has been produced. GPT-6 Astra is never an allowed substitute. Do not claim
that a model identity is known unless the host provides authoritative metadata.
