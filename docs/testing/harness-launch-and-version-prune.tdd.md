# Harness launcher and old-version cleanup — TDD evidence

Date: 2026-10-04. Package: OmniRoute 0.6.7.

## Scope

Fix the packaged command failure where `Launch.ps1 -Action harness` rejected
`harness`, and stop ordinary upgrades from retaining every older managed runtime
copy. Preserve the active runtime, one rollback runtime, provider keys, settings,
and any unknown or modified files.

## Red phase

Commit `2c962ae` added the regression tests before production changes. The
focused suite failed in two places: Windows/Linux launchers did not forward the
`harness` action, and an upgrade through three versions retained all three
runtime folders instead of pruning the oldest one. The fixture also asserts that
the key file survives and rollback selects the immediately previous version.

## Green phase

- `node --test distribution/install.test.mjs distribution/dual-setup.test.mjs`:
  **38/38 passed**.
- `npm run test:regular`: **179 passed, 2 platform-specific skips**, no failures.
- The final 0.6.7 family ZIP smoke scanned **2,781 archive entries**, verified
  both OS manifests, completed **3 Antigravity and 3 OpenCode registered MCP
  handshakes**, and exercised update/rollback. The provider was a fixture; no
  live inference ran. Native Linux installation was not tested.

The cleanup only removes version directories whose installer manifest, payload
hashes, exact file inventory, and directory shape all verify. Directories with
extra files, edits, links, or invalid metadata are left in place. Keys/settings
live outside these runtime directories. No live OpenCode session, API key, or
provider request is used by these regression tests.

## Behavior and limits

Both launchers forward the `harness` action to the bundled `apps/cli/dist/bin.js`;
with no extra arguments it defaults to `opencode --mode regular`. Successful
updates retain the new active runtime and the prior active runtime as the single
rollback version. Re-running the already-active installer applies the same
safe cleanup to older verified copies. Unknown or user-modified folders are
intentionally not force-deleted, so cleanup can leave a folder behind when it
cannot prove that folder is wholly package-owned.
