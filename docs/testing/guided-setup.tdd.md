# Guided setup v0.2.1 — TDD evidence

Date: 2026-08-31. Journeys derived from the user's request for sequential setup and less repetitive key entry.

## RED / GREEN checkpoints

- `d34a1d0`: `node --test distribution/guided-setup.test.mjs` executed six tests; all failed because `runGuidedSetup` was not implemented. The first sandbox attempt failed to spawn Node and is not counted as RED evidence.
- `b0d0a05`: the same six tests passed after implementation. Both checkpoints are on `codex/antigravity-regular`.

## Guarantees

| Behavior | Test | Evidence |
| --- | --- | --- |
| Key setup precedes workspace preview and approved launch | guided-setup.test.mjs | PASS |
| Cancelled/failed key editor never connects or creates workspace | guided-setup.test.mjs | PASS |
| Declined confirmation does not apply integration | guided-setup.test.mjs | PASS |
| Preview failure stops launch; launch failure reports possibly applied integration | guided-setup.test.mjs | PASS |
| Spaces and shell metacharacters remain literal arguments | guided-setup.test.mjs | PASS |
| Invalid state, relative roots, nonexistent projects and noninteractive input fail closed | guided-setup.test.mjs | PASS |

The sequencing tests inject Settings/host interactions; the added process-wrapper test also starts real Node children and checks failed executable startup. They do not prove real account eligibility, Windows dialog interaction, Antigravity rule adherence or Linux desktop keyring availability. No real keys were entered or provider quotas deliberately exhausted.

## Final executed checks

- `npm test`: **146/146 PASS**, no skips, 75.7 seconds.
- `npm run test:regular`: **45 PASS, 1 Linux-only skip** on Windows after the final packaging regression.
- `node --test --experimental-test-coverage --test-coverage-include=distribution/guided-setup.mjs distribution/guided-setup.test.mjs`: **7/7 PASS**, 88.14% lines, 94.44% branches, 85.71% functions. Untested lines are the interactive readline adapter and CLI error boundary; injected sequence tests cover the main flow.
- Ubuntu with bundled Linux Node 22.23.2: guided setup tests **7/7 PASS**.
- `npm run test:package`: extracted Windows v0.2.1 archive **PASS**, including install/reinstall with spaces, masked-form smoke, fixture vault, MCP discovery/routing/reconnect and recoverable uninstall.
- `wsl -d Ubuntu -- sh /mnt/c/Users/thest/Downloads/subagent/omniroute-regular/scripts/linux-package-smoke.sh`: extracted Linux v0.2.1 archive on Ubuntu native `/tmp` **PASS** for the corresponding shell/install/MCP checks. No real desktop keyring was used.
- Windows fixture routes: `00MTH1WO49HU4OFEEMSJT_HQ`, `00MTH1WO5KVZH06CCQSASUMW`. Ubuntu fixture routes: `00MTH1W5NL5TJTVTBQ99SO7Q`, `00MTH1W5ODNHVH_5NNNTN5FA`. These use fake providers, not live coding evidence.
- Linux smoke helper version regression: RED `e0bffd6` caught a hardcoded v0.2.0 archive; GREEN `f095233` follows package.json. Packaging target **3/3 PASS**.
- `git diff --check`: clean. Tracked-file name and common credential-prefix scans found no credential artifacts/matches; this is not proof that every possible secret format has been detected.

Archive payloads are verified before documentation-only finalization; no runtime bytes change and outer SHA-256 files are refreshed. Build provenance records the source snapshot at build time. Live host login/tool-adherence and real provider billing remain unverified.

## Security review

Guided setup reads only project paths and confirmation. Secrets remain in the existing masked Windows UI or hidden Linux TTY, then go to the existing vault backend. No credentials are added to arguments, setup output, Git or archives. The guided flow requires explicit workspace approval and never runs git in the user's project. Existing install-only switches remain available.

## Worker review attribution

The bounded checklist was reviewed locally. Its suggestions to automatically commit installed user metadata and to claim signature verification were rejected: Git publication is a separate maintainer action, and these packages have checksums, not signatures.

```text
OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/groq/compound (low) · task: medium · route: 00MTH1HWPSDNP5YD_ABVUYZW
```
