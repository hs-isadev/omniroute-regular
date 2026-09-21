# OmniRoute core upgrade — no Devin Fusion

Implement only the core reliability and packaging upgrade in the existing
OmniRoute repository. Do **not** implement Devin Fusion, durable autonomous
task planning, recursive decomposition, multi-agent swarms, automatic repair
loops, or a second planner.

Read all applicable `AGENTS.md` files and inspect the current source, tests,
provider catalog, routing, MCP integration, OpenCode integration, Antigravity
integration, browser consumers, startup installers, and Windows/Linux package
scripts before editing. Preserve unrelated changes and never include secrets.

## Required model policy

Before starting, identify the actual model running this task. If it is not the
model assigned to this prompt, stop immediately and tell the user:

`This task requires <recommended model>. I am <actual model>, so I am stopping.`

Then provide this prompt again for the correct model. Do not silently
substitute Astra or Sol. Recommended model: **GPT-5.6 Luna**. Union Alpha may
be used only when live discovery proves it is currently free, healthy, and
capable; it is temporary and must never become a hardcoded dependency.

## Core requirements

### 1. Provider and model routing

- Make OmniRoute the single routing authority for eligible requests.
- Add live provider/model discovery with health, capability, price, quota,
  privacy, context, latency, and terms metadata.
- Select the best currently eligible route by evidence, not model name.
- Prefer OpenCode Zen `union-alpha` only while it is live and free.
- Automatically fall back to the strongest currently eligible free route.
- Keep `openrouter/free` and other aliases attributed honestly; never invent the
  underlying model identity.
- Reject unknown-price, paid, unhealthy, unsupported, stale, or blocked routes.
- Fix blocked candidates such as provider/model combinations returning 403
  instead of repeatedly selecting them.
- Prevent nested OmniRoute/gateway routing loops.
- Return compact results by default: answer, provider/model, badge, route ID,
  and concise diagnostics. Do not dump giant routing diagnostics unless asked.

### 2. OpenCode integration

- Give OpenCode one host model selected from the live provider catalog.
- Prefer the current eligible free OpenCode Zen model, including Union Alpha
  only when available.
- Disable hidden competing fallback and paid fallback.
- Preserve user configuration and never inject credentials into private
  OpenCode storage.
- Keep OmniRoute as the outer routing authority.

### 3. Maximum practical OmniRoute utilization

- Make OmniRoute the default first worker for nearly every ordinary project
  request: repository inspection, code search, architecture discussion, coding
  suggestions, implementation planning, debugging, test analysis, review,
  documentation, packaging analysis, and bounded code-generation work.
- Do not require the user to manually ask for delegation each time. Automatically
  dispatch eligible work through `omni_route` with `routingMode=regular`.
- Send relevant source code, tests, configuration shape, logs, and task context
  to the worker. Do not send credentials, cookies, authentication files,
  browser profiles, private account data, or unrelated personal files.
- Use one capable worker for the primary answer. Use a second sequential worker
  only for an independent review, failed verification, or clearly separate
  read-only analysis. Do not create an unbounded swarm.
- Keep the host responsible for applying local edits, approvals, credentials,
  destructive commands, third-party actions, and final verification.
- Return only the worker answer, changed-file suggestions, verification result,
  attribution badge, route ID, and concise failure details by default.
- Bypass OmniRoute only for simple acknowledgments, secret/auth handling,
  destructive or external side effects requiring approval, or when the worker
  is unavailable or unsuitable.

### 4. Windows/Linux one-click setup

- Provide one-click setup on Windows and Linux with native paths, quoting,
  permissions, process handling, upgrade, rollback, repair, and uninstall.
- Keep exactly three interactive exceptions:
  1. browser consumer sign-ins;
  2. entering the user's own BYOK keys;
  3. installing/signing in to the user's own Antigravity app/account.
- Explain and pause at those checkpoints; never automate account creation or
  scrape browser sessions.
- Preserve unrelated user configuration and make reruns idempotent.
- Never enable paid billing or silently use paid routes.

### 5. Six foreground browser consumers

- Support six user-authenticated browser consumer adapters.
- Keep them foreground when sign-in or diagnostics are needed.
- When the user enables start-on-boot, launch all six at every Windows login or
  Linux session start.
- Use one idempotent managed startup registration with no duplicate entries.
- Remove stale `.backup-*` files and prevent future backup artifacts from being
  created in Startup/autostart directories.
- Serialize requests, enforce spacing and budgets, restrict them to small
  tasks, and stop on challenges, throttling, policy notices, or auth failure.
- Never read cookies, local storage, login databases, or private auth files.

### 6. Credentials and safety

- Use OS-appropriate secure storage or environment references.
- Redact keys from logs, diagnostics, archives, crash reports, and diffs.
- Do not package credentials, browser profiles, sessions, Antigravity data, or
  private workspaces.
- Do not rotate accounts, VMs, IPs, proxies, or profiles to evade quotas.

### 7. Source and download packages

- Build clean Windows and Linux source/download packages.
- Include manifests, checksums, version metadata, install instructions,
  migration notes, rollback instructions, and known limitations.
- Exclude credentials, caches, logs, browser profiles, temporary files, and
  backup artifacts.
- Test clean install, safe rerun, upgrade, rollback, uninstall, paths with
  spaces, MCP connection, OpenCode model selection, and startup registration.

## Delivery rules

1. Inspect first and report the affected files.
2. Implement only these core requirements; do not add Devin Fusion features.
3. Add focused tests for routing, blocked-provider filtering, compact output,
   OpenCode selection, credential redaction, startup idempotency, backup cleanup,
   Windows/Linux setup, and package contents.
4. Run focused tests, then relevant package checks.
5. Review the diff for secrets, paid fallbacks, routing loops, duplicate
   startup entries, and unrelated changes.
6. Report changed files, verification commands/results, remaining limitations,
   and artifacts produced.
7. Do not push, publish, merge, or modify third-party accounts without explicit
   approval.
