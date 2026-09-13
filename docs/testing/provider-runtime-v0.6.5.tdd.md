# Provider and runtime verification — 0.6.5-private.1

Date: 2026-09-13.

## RED

- Provider registry test reproduced a slow first health check consuming the shared
  deadline and making a later healthy provider fail without receiving its own time.
- Package verification accepted a manifest with no bundled Node runtime.
- Antigravity connection accepted missing command/entrypoint paths.
- Rollback left host registration on the superseded version; rolling forward into
  an already staged verified version failed with `EEXIST`.
- Safe-provider validation lacked stable metadata-only reason codes and model
  discovery exclusions.

## GREEN

- Provider registry uses concurrent independent checks and preserves configured
  order in the result.
- Install/registration resolve and verify required runtime files. Rollback repairs
  hosts with the current management code; verified inactive stages can be reused.
- Validation tests distinguish disabled/unconfigured routes, safe failure classes,
  false success, and unsupported discovery results without generation.
- Focused installer, host and provider validation suite: 25/25 passed.
- Full gates: TypeScript/build passed; core 185/185; routing evaluations 15/15;
  distribution 139 passed, two platform skips, zero failures; security/vault 15/15;
  production dependency audit zero vulnerabilities.

Full build, security, package, installed registration and archive results are
recorded in the sealed candidate's `VERIFICATION.md` and family smoke evidence.
