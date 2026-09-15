# OpenCode local gateway and safe Devin setup — TDD evidence

## Scope

This change removes the old upstream-key dependency from `omni harness opencode
--mode regular` and adds an optional Windows x64 Devin CLI installer/integration.
No test uses a real provider key, browser session, saved prompt, or account.

## Red phase

`npx tsx --test --test-concurrency=1 tests/harness-env.test.ts
tests/local-daemon.test.ts` initially failed because the harness still emitted an
OpenRouter-only configuration and `local-daemon.ts` did not exist.

`node --test distribution/devin.test.mjs` initially failed because the packaged
Devin module did not exist. `node --test distribution/dual-setup.test.mjs` then
failed because the Windows setup script had no verified Devin installer or visible
launcher.

The red tests assert that regular OpenCode uses only a loopback `/v1` gateway,
does not inherit upstream credentials, starts a temporary daemon only after a
local-unreachable result, and fails closed for other daemon errors. They also
assert that Devin registration adds only `omniroute_regular` with regular-mode
environment values and never supplies a model/Fusion/API-key argument.

## Green phase

- `npx tsx --test --test-concurrency=1 tests/harness-env.test.ts tests/local-daemon.test.ts`
  passed: 15/15.
- `node --test distribution/devin.test.mjs distribution/dual-setup.test.mjs`
  passed: 23/23.
- `npm run build && npx tsx --test --test-concurrency=1 tests/cli.test.ts`
  passed: 7/7. The added CLI test used a temporary local daemon and fake
  OpenCode command; no provider request was made.

The installer accepts only the fixed official Devin updater URL, its pinned
SHA-256, and a valid `Exafunction, Inc.` Authenticode signature. It does not use
pipe-to-shell installation, does not read or merge Devin configuration, and
leaves a failed/duplicate registration for user review instead of deleting any
entry.

## Coverage note

The project has no configured coverage-reporting command. Focused behavioral,
CLI, static-installer, package-module, and full package smoke tests are recorded
instead; the remaining coverage percentage is not measured.
