# Existing-setup key status and replacement — TDD evidence

User journeys derived for this change:

- As a user in “OmniRoute - Provider keys (existing setup),” I can see the last known state of each saved slot without revealing its secret.
- I can explicitly mark an occupied slot for replacement; the old credential remains until its replacement validates.
- If a provider is temporarily rate-limited or unreachable, that does not falsely label a key expired.
- A typed but unaccepted key is shown as not saved, and existing add-to-next-free-slot behavior remains the default.

## RED / GREEN checkpoints

- `181e868` added backend tests first. RED was confirmed with `node -e "import('./distribution/settings.test.mjs')"`: ESM import failed because `getCredentialStatuses` and `checkCredentialStatuses` did not exist.
- `2b0df33` added UI contract tests first. RED was confirmed with `python distribution/settings-gui.test.py` (missing status operation/replace forwarding and UI markers) and the in-process `key-launcher.test.mjs` check (existing-setup forms had no status/replace controls).
- The implementation was then added and the focused backend, Linux form and Windows Forms smoke checks passed (commands/results below).

## Guarantees covered

| Guarantee | Test | Evidence |
|---|---|---|
| A validated saved slot appears as healthy; returned status and its sidecar never contain credential text. | `distribution/settings.test.mjs` | Backend test verifies the JSON status sidecar and response contain no fixture key. |
| An explicitly selected replacement overwrites only that slot after acceptance. | `distribution/settings.test.mjs` | Test verifies neighboring slots remain unchanged and the replacement is healthy. |
| A rejected replacement preserves both the old key and its previous status. | `distribution/settings.test.mjs` | Fixture authentication failure leaves the old vault value/status intact. |
| An authentication rejection is shown as expired/rejected; a quota response leaves prior health intact and records the blocked attempt. | `distribution/settings.test.mjs` | Fixture 401/429 checks; exactly one provider request per saved slot. |
| Invalid replacement coordinates cannot mutate credentials. | `distribution/settings.test.mjs` | Unknown provider and out-of-range slot cases reject before save. |
| UI IPC filters invalid providers, slots and status values; replacement selection is submitted only from the existing-setup form. | `distribution/settings-gui.test.py` | Python mocked subprocess tests. |
| Windows and Linux existing-setup forms contain status and explicit replacement controls. | `distribution/key-launcher.test.mjs` | Static form contract check. |

## Verification and limits

- `node -e "Object.defineProperty(process,'platform',{value:'linux'}); import('./distribution/settings.test.mjs')"`: **24 tests, 23 passed, 1 Windows-DPAPI test skipped**. This in-process mode avoids a sandbox `spawn EPERM` from Node's child test worker; the skipped test specifically requires Windows DPAPI subprocess creation.
- `python distribution/settings-gui.test.py`: **7 passed**.
- `node -e "Object.defineProperty(process,'platform',{value:'linux'}); import('./distribution/key-launcher.test.mjs')"`: **1 relevant source-contract test passed; 4 platform/process tests skipped**.
- `Settings.ps1 -Simple -SmokeTest` and `Settings.ps1 -Simple -ExistingSetup -SmokeTest`: **both passed**, including the existing form's per-slot replacement/status controls and masked fields.
- `node -e "Object.defineProperty(process,'platform',{value:'linux'}); import('./distribution/private-package-shortcut.test.mjs')"`: **3 passed**, including package version consistency and presence of the status UI in the packaged launchers.
- `npm run typecheck`, `node --check distribution/settings.mjs`, `python -m py_compile distribution/settings-gui.py`, and `git diff --check`: **passed**.
- Status refresh is opt-in and makes one short, free-profile inference request per saved key; it can consume free quota. A 401/403 is displayed as “Expired / rejected” because providers do not reliably distinguish expiry from revocation or malformed credentials. Transient quota/network failures preserve the previous status and show the failed attempt.
- No real API keys were loaded or tested. Live provider behavior, provider quotas and expiry remain dependent on each provider. Linux Tk UI was tested with its Python IPC/unit tests, not in a Linux desktop session.

## OmniRoute design review

The worker proposal to persist credential hashes was not used. The local implementation associates status with the vault record's creation timestamp and stores only provider ID, slot number, status and safe timestamps/reason codes in the status sidecar.

```text
OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/openai/gpt-oss-120b (low) · task: critical · route: 00MUTAL5FQ9ECRMJ1PPTYBNW
```
