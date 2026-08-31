# Antigravity Regular v0.2 — test evidence

Date: 2026-08-31. Plan: [migration blueprint](../../plans/antigravity-regular.md).

## Scope and environments

Windows 11 x64, build 26200; development Node 22.13.0, bundled runtime 22.23.2. Linux runtime tests use Ubuntu 24.04.3 LTS x86_64 under WSL2, with files extracted onto its native /tmp filesystem. This is not a Linux graphical Antigravity test. Official agy CLI 1.1.16 was detected on Windows; help/version inspection does not prove host MCP integration.

No live installation, existing global host configuration, account credentials or payment settings were changed. No native subagents were used. No push/publication occurred.

## Executed source checks

- Final `npm test`: **146/146 PASS**, no skips or cancellations, 59.8 seconds. An earlier run cancelled the legacy source-installer test at 120 seconds because it traversed generated release/build trees; the pruning regression fix resolved it. The routing/fallback target also passed 24/24 independently.
- `npm run typecheck`: passed after the final core change.
- `node --experimental-test-coverage --test-coverage-include='distribution/*.mjs' --test-coverage-exclude='distribution/*.test.mjs' --test distribution/*.test.mjs`: 37 passed, 1 platform-specific Linux installer test skipped on Windows. Lines 81.99%, branches 80.85%, functions 91.03%. Includes legacy Linux helper modules; excludes test files. This is not full-repository coverage. Final targeted non-legacy Regular checks passed 32/32 after the documentation packaging change.
- `npm run eval`: 15/15 synthetic fixtures. Its reported dollars are fixture math, not paid API spending; latency/accuracy are deterministic mock results, not real model benchmarks.
- Full runtime regression for upstream-error prompt echo: 4/4 passed after the log fix.

## RED/GREEN history (current task branch)

| Guarantee | RED checkpoint | GREEN checkpoint / evidence |
|---|---|---|
| Preview/merge workspace MCP, protect user edits | dc0d011: missing integration API | 4600e06: 4 passing tests |
| Groq-only setup, regular-only runtime | f042c01: OpenRouter dependency/missing entrypoint | 2dac9cb: 18 passing tests |
| Versioned install and rollback | d281f9b: missing installer | 17548f1: 2 passing tests |
| Safe launcher import, preserve edited launchers, detect tampering | fa83239: 3 failing guarantees | c2aaa6e: 5 passing tests |
| Antigravity package contents and wrappers | 95c7570: old OpenCode payload/paths | 72216c8: 2 passing tests |
| Malay and continuation context | 4dc33dd: 3 failing cases | 56ed452: 3 passing tests and typecheck |
| No inadequate tiny coding fallback | 072d917: incorrectly stayed on Groq small | f6164cd: 23 passing fallback tests |
| Opt-in separately validated Kimi/Qwen | 6dbe432: candidates missing | 76c232c: 12 passing settings tests |
| Strongest eligible initial configured tier | 9a7be0b: Groq tier4 chosen over Gemini tier5 | 1ca0db8: 24 passing fallback tests |
| Provider error echo not persisted | 5cc1731: private marker in log | 04326e4: 4 passing runtime tests |
| Cross-built Linux execute permission | e2bf4ed: extracted Node permission denied | c29a421: extracted Linux install/MCP smoke passed |
| Include linked evidence in archives | 3a7b6b5: missing evidence document | 60aa0d5: 2 packaging tests passed |
| Source installer excludes generated archive trees | a44559b: source guard failed after repeated rollback-test timeouts | 085e837: 2 standalone tests passed, then full suite 146/146 |

The old launcher's import test was initially denied by the sandbox because importing it could read live credentials and launch OpenCode. It was replaced with a source guard; the legacy live launcher was never run for that test.

## Archive checks

Initial Windows archive: PASS for checksum, fresh/repeated install with spaces, Windows masked-form smoke test, Groq-only fake-key encrypted setup, real stdio discovery/invocation with production router and **fake provider**, small/strong selection, error response, EOF shutdown/reconnect, content-free success logs, workspace merge/detach, recoverable uninstall and unchanged fixture vault.

Initial Windows fixture route IDs: `00MTGWIU0AJA2ZQOF3YJ-EUW`, `00MTGWIU1CK0WT0RXXDUM3SG`. These are test-provider evidence, not live model calls.

Initial Linux archive: failed because Windows-created tar did not preserve Node's execute bit. This failure was found by executing the extracted artifact, not by source-only inspection. Final archives must pass the same test after the setup fix.

Final runtime archives: **PASS on Windows and Ubuntu**. Both were rebuilt after the final core/stdio logging changes. The Linux permission fix was tested by extracting the tarball and executing Setup.sh on Ubuntu's native filesystem, not by merely running a Windows-built shell syntax check.

Final Windows fixture route IDs: `00MTGWT6I1PAV_CASJCPVATQ`, `00MTGWT6J2QD506-DHY_AQGG`.
Final Ubuntu fixture route IDs: `00MTGWQFK2CY3JWH4GJVFPZW`, `00MTGWQFKUSSRH4N0BG_J5QW`.

The test-evidence documentation is copied into archives after these tests, without changing payload or manifest bytes; payload checksums are verified again and outer archive SHA-256 files regenerated. Provenance accurately labels the build as an unsigned dirty-worktree snapshot based on commit 04326e4; it is not a reproducible signed release.

Legacy source-installer standalone rerun after pruning: **2/2 PASS**, including the full injected-failure rollback test in 25.8 seconds. This confirms the timeout regression was resolved without increasing or skipping the test deadline.

## Live checks intentionally not claimed

- Real Antigravity MCP discovery, automatic tool adherence, host application/test of a worker answer, and native-versus-delegated benchmarks: **not run; awaiting explicit live-test approval**.
- Real Kimi/Qwen/Zen coding-quality comparison and each account's quotas/billing: **unverified**. Candidate connectivity probes during user setup are not executable correctness benchmarks. Configured tiers are provisional.
- Real Linux Secret Service round trip: **not run here**; secret-tool/keyring service absent. Fixture vault encryption and fail-closed behavior are tested. CI is configured to provide a synthetic keyring, but no remote CI success is claimed.
- Windows DPAPI round trip: passed with synthetic secrets in temporary fixtures, not the user's vault.
- Universal host interception, unlimited usage, guaranteed savings or frontier equivalence: not implemented or claimed.
- Account-wide cooldown coordination across host processes, audit-history size rotation, signed releases, and crash/power-loss atomicity across multiple files remain limitations. File update failure rollback is implemented; it is not a transactional filesystem.

## Worker review attribution

The earlier architecture worker response was checked locally; unsupported suggested permissions were not implemented. Attribution retained verbatim:

```text
OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/openai/gpt-oss-120b (low) · task: medium · route: 00MTGV0D9GV5XXJYKV2E_5IG
```

A later bounded review attempt returned `No eligible free worker meets capability/context requirements outside its cooldown`. No paid or native-agent fallback was used.
