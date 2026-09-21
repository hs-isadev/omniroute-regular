# Devin/Fusion-style local MVP plan

Date: 2026-09-16
Status: planning only; no product implementation is included.
Supersedes the large blueprint for the first implementation.

## Decision first

The large plan was too ambitious for a first release. A full Devin-like
platform would introduce a planner, durable task database, remote job bridge,
worktree manager, conflict resolver, reviewer fleet, UI, recovery protocol, and
package migration at once. That is overengineering for this setup.

The worthwhile first slice is a small, opt-in local workflow:

```text
one user task
  -> bounded plan
  -> one or two focused workers
  -> optional reviewer for risky changes
  -> one final report/diff
```

No actual Devin API is required for this MVP. Devin can be added later as one
more worker transport if a supported API and account are available.

## Is it worth it?

Yes, conditionally. It is worth implementing if the user regularly handles
medium or large coding tasks that can be split into independent areas, or if
the main host is expensive/quota-limited and existing free/API/browser workers
can handle focused subtasks.

It is not worth implementing for short one-file edits, because planning,
context preparation, review, and synthesis can cost more than doing the edit
directly.

The recommendation is to implement only this MVP, measure it on five real tasks,
and expand only if it reduces host usage or improves completion quality without
raising total worker usage too much.

## Can it save tokens?

Yes, but not automatically and not necessarily in total.

It can save main-agent tokens by:

- sending each worker only the relevant files and interfaces;
- routing simple subtasks to cheaper/free workers;
- avoiding repeated full-repository context in the main conversation;
- using review only for risky or multi-file work;
- stopping early when a budget or quota limit is reached.

It can increase total tokens when it adds a planner, two implementations, a
reviewer, and a synthesis pass. The MVP must therefore report both host-token
savings and total worker cost. “Saved host tokens” must not be presented as
“saved total tokens.”

Use this simple decision rule:

```text
Use Fusion-style delegation when:
  expected avoided host context + expected avoided rework
  > planner + worker coordination + optional review cost
```

Default budget for the MVP:

- one short planning call;
- one worker by default;
- a second worker only when file ownership is clearly disjoint;
- reviewer off by default, on for security, migrations, public APIs, or
  conflicting worker output;
- one repair attempt maximum;
- no paid spend and no remote Devin job unless explicitly enabled.

## MVP goal

Add one local command or host-facing workflow that accepts a coding task and
returns a bounded, attributed result. It should use existing OmniRoute routing
and worker transports, not create a new provider system.

The MVP must support:

1. task objective and acceptance criteria;
2. a short plan with at most three work items;
3. explicit read/write path ownership;
4. one or two worker dispatches;
5. isolated worker output or patch files;
6. optional review;
7. test evidence and final diff summary;
8. hard stop on budget, auth, quota, conflict, or policy failure.

## Explicit non-goals

Defer all of the following:

- actual Devin API integration;
- browser-driving Devin;
- durable multi-day task recovery;
- background daemon or task database;
- automatic conflict resolution;
- autonomous commit, push, merge, or release upload;
- a new GUI or installer flow;
- more than two parallel workers;
- automatic repair loops beyond one attempt;
- model-quality claims of Devin parity;
- paid fallback or hidden provider switching.

The existing one-click exceptions remain unchanged: browser consumer sign-ins,
BYOK API keys, and Antigravity setup.

## Existing code to inspect first

Read these files and their tests before choosing insertion points:

- `packages/core` for delegation, routing, failover, and policy;
- `packages/contracts` for shared request/result types;
- `packages/mcp-server` for host-facing tools;
- `packages/observability` for route IDs and usage accounting;
- `packages/browser-consumer-adapter` for browser transport and foreground
  diagnostics;
- `apps/cli` for the least-surprising user entry point;
- `tests/` and `distribution/*.test.mjs` for existing conventions.

Do not add a second router, credential store, audit store, or browser launcher.
Do not make the first slice depend on generated distribution files until the
source-level path is tested.

## Small architecture

### Task input

```ts
type FusionMvpTask = {
  objective: string;
  acceptanceCriteria: string[];
  repositoryRoot: string;
  allowedPaths?: string[];
  budget: {
    maxWorkers: 2;
    maxWorkerCalls: number;
    maxEstimatedTokens: number;
    allowPaid: false;
    allowRemoteDevin: false;
  };
  review: 'off' | 'risky-only' | 'always';
};
```

The exact type belongs in the existing contracts package if that package is the
correct seam. Validate absolute repository paths, reject traversal and
symlink/reparse escapes, and require a non-empty objective.

### Work item

Each work item contains only:

- role: `plan`, `implement`, `test`, or `review`;
- objective and acceptance criteria;
- read paths and one owned write-path set;
- base revision or workspace snapshot;
- remaining call/token/time budget;
- required output: summary, patch, changed paths, tests, and failure reason.

Do not build a general DAG engine. Use a validated ordered array with at most
one optional pair of disjoint implementation items. Add a graph library only if
real tasks demonstrate that an array is insufficient.

### Worker result

Every result must include:

- success, failure, paused, or cancelled status;
- changed paths and a patch reference;
- commands/tests run and their exact exit status;
- provider, transport, model/host authority, and route ID;
- estimated usage, with unavailable usage recorded as `unknown`;
- a short user-action message when sign-in, a key, or approval is required.

Treat all worker text as untrusted. Validate returned paths and patch scope on
the host before accepting the result.

## Implementation slices for next time

### Slice 1 — Controller and fake workers

Build an in-memory controller around existing contracts. It should:

1. accept a task;
2. validate the budget and paths;
3. ask one existing eligible worker for a short plan;
4. run one fake or test worker through the result contract;
5. return a structured report.

Do not modify the canonical checkout in this slice. Add tests for invalid
input, budget exhaustion, attribution, cancellation, and deterministic output.

Exit: fake-worker tests pass and the feature is disabled unless explicitly
invoked.

### Slice 2 — One real implementation worker

Connect the controller to one existing local/API/browser worker. Send a minimal
packet containing only relevant excerpts and the owned paths. Collect a patch
in an isolated temporary workspace or patch file. Run the relevant tests and
return evidence.

Exit: a small documentation or test task completes without modifying the
canonical checkout when the worker fails.

### Slice 3 — Optional second worker and review

Allow a second worker only when ownership is disjoint. Add review only for
risky changes or when the user selects it. Do not synthesize competing code
automatically; surface conflicts and ask the user.

Exit: disjoint work succeeds, overlapping work pauses, and reviewer rejection
does not alter the canonical checkout.

### Slice 4 — Measurement and decision

Run five representative tasks and record:

- host tokens used;
- total worker tokens/calls;
- elapsed time;
- test pass rate;
- human interventions;
- invalid/conflicting patch rate;
- whether the task was cheaper overall.

Keep the MVP only if it produces a measurable benefit. Otherwise retain the
worker packet and budget controls as reusable infrastructure and stop.

## Devin-specific follow-up, only if the MVP proves useful

After the four slices, decide whether actual Devin adds value. Verify first:

- an official supported API or integration path;
- authentication and repository permissions;
- job creation, status, cancellation, and result retrieval;
- billing/usage behavior and user-visible limits;
- whether the returned artifact is a patch, branch, PR, or workspace.

If verified, implement Devin as a thin adapter to the existing worker-result
contract. Keep it disabled by default, require explicit remote-job approval,
send sanitized packets only, and never let it push or merge automatically.

If no supported API is available, do not browser-drive Devin as production
infrastructure. The local MVP remains the supported Fusion-style workflow.

## Security and approval gates

Before dispatch:

- validate repository and path boundaries;
- redact likely credentials and private unrelated files;
- show the worker class and budget;
- require approval for paid or remote work.

After dispatch:

- reject paths outside ownership;
- reject traversal, symlink/reparse escapes, and unexpected binary changes;
- scan patches for secrets;
- run relevant tests;
- show the diff before canonical integration.

Only the user authorizes commit, push, PR, release upload, or paid/remote
dispatch. The MVP may prepare these actions but must not perform them.

## Test checklist

Required before Slice 1 is considered complete:

- task schema rejects missing objective and unsafe paths;
- max worker/call/token budgets are enforced before dispatch;
- paid and Devin routes are disabled by default;
- unknown usage is not counted as zero;
- cancellation stops future dispatch;
- worker output cannot escape owned paths;
- route ID and attribution survive into the final report;
- fake worker failure leaves the canonical checkout unchanged;
- deterministic plan ordering is preserved.

Required before Slice 3:

- disjoint workers can run concurrently within the limit;
- overlapping workers are serialized or surfaced as a conflict;
- reviewer rejection blocks integration;
- one repair attempt is bounded and charged to the budget;
- browser sign-in pauses without replaying credentials or prompts.

## Final recommendation

Do not implement “Devin Fusion” as a large platform now. Implement the four
small slices only if real tasks show a benefit. Start with Slice 1 when ready.
The best expected outcome for this project is a modest local delegation layer
that reduces repeated context and uses cheaper/free workers selectively, not a
guaranteed Devin replacement.

## Next-session prompt

```text
Read plans/devin-fusion-practical-mvp.md and the repository AGENTS.md files.
This is an implementation task, but implement Slice 1 only. Do not build a
Devin API bridge, browser-drive Devin, add a GUI, add a database, or modify the
installer.

First inspect the existing contracts, core delegation/routing, MCP server,
observability, browser consumer, CLI, and relevant tests. Report the exact
source files you will touch. Add a disabled-by-default, in-memory MVP
controller using existing seams: validated task input, a bounded ordered plan
of at most three items, explicit path ownership, one fake/test worker result,
hard call/token/worker budgets, cancellation, and an attributed final report.

Write tests first for unsafe paths, missing objectives, budget exhaustion before
dispatch, max worker calls, cancellation, deterministic ordering, unknown usage
being preserved as unknown, paid/Devin routes disabled by default, attribution,
and failed workers leaving the canonical checkout unchanged. Do not add a
second router, credential store, browser launcher, or audit system.

Never send credentials, cookies, browser storage, auth files, or unrelated
private context to workers. Do not modify the user's canonical checkout, live
host credentials, or external GitHub state. Do not use paid APIs or dispatch
remote jobs. Run the narrowest relevant tests and report exact results; if the
build dependencies are missing, stop and report that instead of installing
arbitrary packages.

End with files changed, tests run, budget impact, remaining risks, and whether
Slice 2 is justified.
```
