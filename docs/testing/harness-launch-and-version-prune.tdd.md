# Harness launcher, browser disablement, and old-version cleanup — TDD evidence

Date: 2026-10-04. Package: OmniRoute 0.6.8.

## Scope

Keep the packaged `harness` action working, disable consumer-browser routing and
startup, and remove old managed runtime copies during successful updates. Preserve
keys, settings, browser profiles, unrelated startup entries, and unknown/modified
runtime folders.

## Red phase

Commit `0596456` added the regression tests before production changes. The focused
tests failed because upgrades retained a previous runtime, one-click setup still
opened browser-consumer tabs, no migration disabled existing browser providers or
removed their startup entries, and the launch wrappers still exposed a consumer
browser action.

## Green phase

- Focused install/migration checks: installer **6/6**, package-shortcut **3/3**,
  dual-setup **32/32** passed.
- `npm run test:regular`: **179 passed, 2 platform-specific skips**.
- `npm test`: **197/197 passed**.
- Windows and Linux manifests verified with **1,383** and **1,380** payload files.
- Extracted package smoke scanned **2,781** files; installed the Windows package
  in a temporary directory, confirmed only the active runtime remains, confirmed
  the legacy browser startup entry was removed and its profile preserved, then
  completed **2 Antigravity and 2 OpenCode MCP handshakes**. Provider invocation
  used a fake provider; there was no live inference. Native Linux installation
  was not tested.

The cleanup only removes version directories whose installer manifest, payload
hashes, exact file inventory, and directory shape all verify. Directories with
extra files, edits, links, or invalid metadata are left in place. Keys/settings
live outside these runtime directories. Browser profiles are intentionally kept.
No live OpenCode session, API key, or provider request is used by these
regression tests.

## Behavior and limits

Both launchers forward the `harness` action to the bundled `apps/cli/dist/bin.js`;
with no extra arguments it defaults to `opencode --mode regular`. Successful
updates retain only the new active runtime; there is no version rollback after an
upgrade. Re-running the already-active installer repeats the same safe cleanup.
Unknown or user-modified folders are intentionally not force-deleted, so cleanup
can leave a folder behind when ownership cannot be verified.
