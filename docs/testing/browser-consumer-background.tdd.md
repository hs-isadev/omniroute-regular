# Browser consumer background hardening — TDD evidence

## RED

`node --test distribution/claude-consumer.test.mjs distribution/zai-consumer.test.mjs distribution/dual-setup.test.mjs`

The baseline kept 14 existing checks green and failed 10 new checks covering
concurrent startup, authentication waiting, CDP minimization, broader browser
discovery, Z.AI peak-hour decisions, and the 0.5.1 package boundary.

## GREEN

- Focused browser/setup suite: 24 passed, 0 failed.
- Full source suite: 161 passed, 0 failed.
- Distribution suite: 101 passed, 0 failed, 2 platform-specific skips.
- Full source-suite coverage: 80.42% lines, 78.26% branches, 87.16%
  functions.
- Production dependency audit: 0 known vulnerabilities.
- The authenticated Z.AI profile passed the new background bootstrap and was
  minimized while its CDP listener remained loopback-only.
- Windows and Ubuntu/WSL extracted-package smoke tests passed two idempotent
  installs, bundled runtimes, masked key-entry UI, and local tool round trips.
- The final staged package scan checked 3,040 files against saved local secret
  values, found no matches, and printed no secret values.
