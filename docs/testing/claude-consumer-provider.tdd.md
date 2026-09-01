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
