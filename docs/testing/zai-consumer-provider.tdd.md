# Z.AI consumer provider TDD evidence

Date: 2026-09-03.

## RED

The first provider tests failed because `ZaiConsumerProvider`, the
`zai-consumer` profile, and the browser module did not exist. After the provider
was implemented, a second release-focused RED run produced 12 passes and 6
expected failures: missing Z.AI setup/autostart functions, missing dual-browser
setup sequencing, missing final package version/adapter provenance, and missing
final-answer DOM extraction. A final regression test then failed because both
browser bootstrap CLIs retained their CDP handles and could block Setup.

## GREEN

- Initial provider/config tests: 34 passed.
- Initial browser distribution tests: 2 passed.
- Release bootstrap/packaging tests: 18 passed.
- Final distribution suite: 95 passed, 2 Windows platform skips, 0 failed.
- Full source suite: 161 passed, 0 failed.
- Full source-suite coverage: 80.42% lines, 78.26% branches, 87.16% functions.
- New `dom.mjs` coverage: 100% lines, 80% branches, 100% functions.

## End-to-end evidence

The adapter attached to the user-controlled dedicated browser profile on
`127.0.0.1:47843`. A natural user prompt requested one exact token; the adapter
returned `OMNIROUTE_ZAI_LIVE_20260903` from `glm-web-consumer`, without the UI's
thinking-chain text. The same profile was then relaunched minimized and the
final packaged bootstrap reported ready and exited cleanly while the browser
remained available.

Both final payload manifests were verified. Windows and Ubuntu x64 temporary
install tests passed idempotency, bundled runtime, masked key UI, and OpenCode
tool-round-trip checks. The release archive contains adapter source and
Playwright runtime code, but not a browser profile or account session. A final
local-secret comparison checked 3,040 staged files, found no matches, and
printed no secret values.

## Boundaries

This proves the observed UI contract and packaging behavior on the test date.
It does not guarantee future site selectors, account quota, model availability,
or upstream terms. The consumer is restricted to small text/coding work and its
failures remain retryable so OmniRoute can use another eligible worker.
