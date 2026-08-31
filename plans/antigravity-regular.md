# Antigravity Regular construction plan

Date: 2026-08-31. Baseline: v0.1.2, Node/TypeScript npm workspaces.
Scope: regular distribution only; preserve GPT/Claude integrations, live credentials and unrelated user data. No publishing or live replacement without approval.

## Architecture and boundaries

Official Antigravity (account login, host quota, local tools) -> local stdio MCP -> deterministic OmniRoute free worker routing. No Antigravity credential extraction or inference proxy. OpenCode is no longer bundled or required. MCP policy guides delegation, not interception. A free host quota can stop the workflow.

Official references checked: https://antigravity.google/docs/mcp/ (workspace `.agents/mcp_config.json`), https://antigravity.google/docs/rules-workflows (`.agents/rules`, always-on activation), https://antigravity.google/download, https://antigravity.google/docs/plans/. Installed AGY CLI 1.1.16 supports interactive launch from cwd. Do not assume desktop/CLI versions behave identically.

## Step 1 — isolated MCP and workspace integration

Context: existing MCP package has three tools, but CLI backend needs an HTTP daemon. Distribution launcher starts OpenCode with mandatory OpenRouter. Build an in-process regular-only runtime without opening a listener; lazy provider discovery and bounded calls. New workspace integration merges only a named MCP entry and a named rules file, detects conflicts, backs up changes, rejects symlinks, and removes only unchanged owned content.

Tests first: any-provider setup, regular-only enforcement, no planner, invalid config, workspace merge/idempotency/conflict/uninstall, no secrets, cancellation, missing host. Run `node --test distribution/antigravity.test.mjs distribution/settings.test.mjs` after build. Exit: these tests pass. Rollback: revert only task-owned source changes; no live files touched.

## Step 2 — provider/intent safeguards

Context: worker classifier and same-provider failover already exist. Preserve contracts and other modes. Add regular-specific capability floors and English/Malay continuation context tests. Reverify stronger model candidates, mark evaluation restrictions and unknown quality explicitly. Unknown prices and paid fallbacks must fail closed. Provider validation must use only eligible configured candidates, not unrestricted discovery results.

Tests: routing/failover regressions, eligibility/quality-floor cases, synthetic provider transport, no OpenRouter setup dependency. Live requests require separately approved existing credentials. Exit: automated tests pass; live/unverified status documented rather than invented. Rollback: preserve original model profiles and existing vault.

## Step 3 — installable Windows/Linux artifacts

Context: current packager bundles pinned Node + OpenCode; Windows installer lacks upgrade. Bundle pinned Node and production OmniRoute dependencies only. Detect official host or show official installer URL; do not redistribute Google binaries. Versioned installs retain data and support rollback; launch selected project with explicit workspace integration preview/apply. Masked credential setup with official links. No startup task; auxiliary processes hidden. Existing profile migration must not modify orchestrator profiles.

Tests: build ZIP/tar.gz, extract into paths with spaces, verify complete manifests (including extras/traversal/reparse rejection), fresh install/rerun/upgrade/rollback, real OS vault encryption, launch dry run and stdio MCP client. Linux must be executed on Linux, not inferred from Windows tests. Exit: both artifacts and checksums exist with honest platform verification. Rollback: previous payload version retained; uninstall leaves data.

## Step 4 — evidence and host acceptance

Context: protocol smoke is not a real host test. Test Antigravity in isolated workspace only after approval; no global MCP settings or auth token inspection. Verify discovery and an actual attributed call, then code/test task. Record host quotas/model authority accurately. Package docs include exact prerequisites, provider restrictions, benchmark limitations and installer provenance. Run full npm test, regular tests, security tests and extracted artifact tests. User must approve live replacement/push/publication.

## Review and execution notes

Steps are sequential because distribution/runtime ownership overlaps. Native agents are not authorized; bounded OmniRoute review was used. Route `00MTGV0D9GV5XXJYKV2E_5IG` raised useful conflict/rollback/host-testing concerns; invented `router:write` permission and speculative deadlock requirements were rejected. No paid fallback.

Progress and RED/GREEN evidence will be recorded in `docs/testing/antigravity-regular.tdd.md`.

Final local status: Steps 1–3 implemented. Windows ZIP and Linux tar.gz built and extracted-install/MCP tests passed on Windows 11 x64 and Ubuntu 24.04.3 WSL2 respectively. Full regression suite: 146/146; Regular distribution coverage: 81.99% lines, 80.85% branches. Step 4 local evidence complete; actual Antigravity/account tests, live installation and publication remain explicitly unapproved/not performed. Linux real desktop-keyring acceptance and executable model-quality comparisons remain unverified. See evidence report for exact boundaries.
