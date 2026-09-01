# Claude consumer browser path CI regression

Date: 2026-09-01

## User journey

As a maintainer, I want browser discovery to honor the requested target
platform so Windows discovery remains testable and reliable from Linux CI.

## Red

GitHub Actions run `33504852945` failed on Ubuntu in
`distribution/claude-consumer.test.mjs`. The test requested `platform:
'win32'`, but browser candidates were assembled with the Linux host's path
implementation, so the expected Opera GX path was never found.

```text
not ok 5 - consumer browser discovery prefers Opera GX on Windows and supports Linux browsers
error: No supported browser found. Install Opera, Chrome, or Chromium, or set OMNIROUTE_CLAUDE_BROWSER.
```

The matching Windows workflow passed this test, confirming the failure was
host-separator dependent. A local Ubuntu WSL replay could not run because that
distribution does not have Node.js installed; the clean GitHub Ubuntu job is
the authoritative RED evidence.

## Green

Pending.
