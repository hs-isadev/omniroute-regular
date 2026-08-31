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

`npm audit --omit=dev --json` found **0 known production dependency vulnerabilities** at this snapshot. This is advisory coverage, not proof of absence of vulnerabilities. Final regression/coverage/package results are recorded after execution.

## Worker review

The worker's recommendations were verified locally. Its claims that a text editor could avoid all plaintext writes, that arbitrary editor backups could be safely deleted, or that every provider exposes billing status were rejected.

```text
OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/groq/compound (low) · task: critical · route: 00MTH205USZ2YL2YSHBXY2OG
```
