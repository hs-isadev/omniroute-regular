# Editor key setup and strict Regular policy — v0.2.2

Date: 2026-08-31. User journeys: installer opens Notepad/Linux desktop editor; saved keys are retained without export; imports reject unsafe paths/fields; Regular never falls back to paid/credit-only profiles.

## Checkpoints

- `ef48e37` RED: 9 failing tests for missing editor import, missing endpoint/model guard and credit-provider exclusion; 1 Linux permission test skipped on Windows.
- `bf506f7` GREEN: 9 passing tests, 1 platform skip. Fixed a Windows PowerShell module-path issue using .NET ACL APIs rather than module autoload. The helper sets a protected ACL for the current user.
- `5626d7c` RED / `40e3561` GREEN: startup now selects the editor by default and preserves explicit masked entry; 8 guided tests passed.
- `0096e38` RED / `931e1ba` GREEN: full fixture-editor flow, cancellation/failure and saved-status refresh passed.

## Security properties and limits

Tests cover unknown/duplicate fields (including empty duplicates), values never echoed in parser errors, bounded input, repository/known-sync rejection, symlink/reparse/hardlink rejection, owner-only permissions, saved-provider metadata without key export, preserved pending edits, blank reuse, encrypted import, partial failures and cleanup race detection. Runtime checks trusted provider endpoints and model IDs before loading credentials; HF/Vercel credit profiles are disabled, not deleted. Main GPT/Claude profile configuration is not migrated.

Plaintext is intentionally present while the user edits. Notepad/editor backups, clipboard managers, storage snapshots, JavaScript string copies, same-user malware, administrators and custom sync configurations remain risks. Cleanup is not secure erasure. Two-file vault/config updates are not crash-atomic. Packages are unsigned and host behavior cannot be guaranteed by MCP tests. "No security issues" and "better than every installer" are not verifiable claims; we report measured checks instead.

## Final executed verification

- `npm test`: **146/146 PASS**, 62.1 seconds, no skips.
- `npm run test:regular`: **58 PASS, 2 Linux-specific skips** on Windows, 23.1 seconds.
- `node --test --experimental-test-coverage --test-coverage-include=distribution/key-editor.mjs --test-coverage-include=distribution/regular-policy.mjs distribution/key-editor.test.mjs distribution/regular-policy.test.mjs`: **12 PASS, 1 platform skip**. New-module totals: **90.16% lines, 84.55% branches, 88.46% functions**. Interactive readline, actual editor discovery/launch and CLI-boundary branches are not fully covered; injected editor/provider fixtures exercise the complete import sequence.
- `scripts/linux-editor-smoke.sh` under Ubuntu/WSL2 using a copied payload: **21/21 PASS**, including actual Linux 0700/0600 permissions and link handling. Synthetic keys only, no real keyring or GUI. An initial cross-shell command failed to resolve its source path before tests ran; the checked-in shell helper removes that quoting dependency.
- `npm run test:package`: extracted Windows **v0.2.2 PASS**, including a private text-file-to-encrypted-vault import with fake credentials, masked-form smoke, install/reinstall, stdio MCP discovery/routing/reconnect, workspace merge/detach and recoverable uninstall. Routes: `00MTH2QJL3P-BZEKQMYK_OIQ`, `00MTH2QJMCFQFLGO-PT6C1DW` (fake providers).
- `scripts/linux-package-smoke.sh` under Ubuntu: extracted Linux **v0.2.2 PASS** for the corresponding import/install/shell/MCP checks. Routes: `00MTH2S9WLOOCI2QXJ9WDN-W`, `00MTH2S9XG4AJWIJTQWVCWVQ` (fake providers).
- Both `npm audit --omit=dev --json` and `npm audit --json`: **0 known vulnerabilities** in the audited dependency graphs. This is advisory coverage, not proof that vulnerabilities are absent.
- `git diff --check`: clean. Common credential-prefix scan of tracked files returned no matches; no real user credentials or live install were changed. This scan cannot recognize every possible secret format.

Archive manifests/payloads are verified before documentation-only finalization and refreshed outer checksums. No runtime bytes change during that step. Actual Notepad/desktop-editor session behavior, Antigravity tool adherence, Linux desktop-keyring availability and provider account billing remain user/environment checks. Free-provider sources and account restrictions are linked in the provider guide; there is no universal remote billing-status guarantee.

## Worker review

The worker's recommendations were verified locally. Its claims that a text editor could avoid all plaintext writes, that arbitrary editor backups could be safely deleted, or that every provider exposes billing status were rejected.

```text
OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/groq/compound (low) · task: critical · route: 00MTH205USZ2YL2YSHBXY2OG
```
