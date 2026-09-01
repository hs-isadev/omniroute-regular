# Claude consumer provider TDD evidence

Date: 2026-09-01

## Scope

This change adds a local MCP-stdio provider that calls the existing
`claude-consumer-adapter`, normalizes its result into OmniRoute usage and
attribution, and limits it to micro/small text or coding work. Medium, large,
critical, web, tool-calling, vision, long-context, and structured-output work
remain outside this provider. Browser cookies and credentials are not read or
copied by OmniRoute.

## Red

The provider tests were added before implementation. The initial focused run
failed with:

```text
SyntaxError: The requested module '@omniroute/providers' does not provide an export named 'ClaudeConsumerProvider'
```

After the live Claude chat was titled `System prompt injection attempt`, a
second regression test captured the request text sent to the browser adapter.
It failed because the adapter received `Be concise\n\nSmall request` instead of
the natural user text `Small request`.

## Green

- Focused provider tests: 13 passed, 0 failed.
- Focused catalog test: 1 passed, 0 failed.
- Focused routing test: 1 passed, 0 failed.
- Natural-request regression test: 1 passed, 0 failed. Consumer-chat requests
  now contain only the user's prompt, without role labels or provider-style
  instruction preambles.
- `npm run typecheck`: passed.
- `npm run build`: passed; MCPB manifest validation passed.
- `npm test`: 158 passed, 0 failed.
- Node experimental coverage over the full suite: 80.21% lines, 78.39%
  branches, 87.09% functions. The modified config and core runtime files
  reached 99.35% and 93.13% line coverage respectively; the monolithic provider
  module reached 69.11% overall while both new provider behavior tests passed.

## Live checks

The built provider connected to the signed-in loopback Opera session and
returned exactly `CLAUDE_OMNIROUTE_LIVE_OK_20260901` with healthy status and
estimated usage.

After a backup and deployment to the active OneDrive installation, the active
OmniRoute daemon was restarted. A real regular-mode route selected
`claude-consumer/claude-web-consumer` and returned exactly
`OMNIROUTE_TO_CLAUDE_OK_20260901`.

```text
OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: claude-consumer/claude-web-consumer (none)
task: small
route: 00MTIHOTK0JZXWWOXT3YHI3Q
```

The pre-deployment runtime/config backup is:

```text
C:\Users\thest\AppData\Local\OmniRoute\backups\claude-consumer-20260901-175137
```

No OmniRoute worker service, paid-provider fallback, native subagent, browser
credential export, or payment-setting change was used during implementation.

## Experiment installer cycle

Installer tests were written before the packaged adapter, browser discovery,
provider configuration, and autostart functions existed. The first run failed
with the expected missing-function and missing-package assertions. Follow-up
regressions also failed before the browser profile path and isolated port were
pinned in autostart and MCP arguments.

The green implementation:

- packages the adapter and pinned Playwright runtime without a browser binary;
- prefers Opera GX on Windows and supports Opera, Chrome, or Chromium on Linux;
- uses a dedicated profile and loopback-only port `47842`;
- enables the credential-free `claude-consumer` entry after BYOK setup;
- writes a per-user, background autostart entry without cookies or account data;
- leaves the four-host BYOK-only implementation on `main`.

The packaged adapter then connected to the existing signed-in loopback browser.
Its connection check returned `ready`, and this ordinary user request:

```text
Could you reply with CLAUDE_CONSUMER_HUMAN_OK, and nothing else? Thanks.
```

returned exactly `CLAUDE_CONSUMER_HUMAN_OK` with 24 estimated combined tokens.
No provider-style instruction preamble was sent.

Final verification after packaging:

- `npm test`: 158 passed, 0 failed.
- `npm run test:regular`: 87 passed, 0 failed, 2 platform skips.
- Windows package: idempotent install, bundled Node/OpenCode checks, masked key
  form smoke, and local OpenCode tool round trip passed.
- Ubuntu/WSL package: idempotent install, 21 JavaScript distribution checks,
  3 Python GUI checks, isolated GUI smoke, and local OpenCode tool round trip
  passed.
- Generated manifests verified 1,511 Windows and 1,508 Linux payload files.
- Secret scan checked 3,029 package files and found no saved secret value.
