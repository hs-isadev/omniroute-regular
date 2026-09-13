# OmniRoute 0.6.4 verification

- TypeScript build/typecheck passes.
- Core, routing, integration and security tests pass, including least-dispatched
  provider/model diversity, strict pins, task-class/capability/context filtering,
  quota/cooldown/failure handling, concurrent requests, and content-free diagnostics.
- Bounded delegation tests cover packet minimization, known/unknown context limits,
  exact boundaries, response/instruction/synthesis reserves, host-owned synthesis,
  and suppression of coupled or oversized work.
- The installed Windows MCP server completes initialize/tools-list and advertises
  omni_route, omni_models, omni_routes and omni_usage. Browser registration policy
  accepts supported local adapters and rejects arbitrary paths/expanded limits.
- The family archive is inspected against its manifest and checksums. It contains
  generated runtime code and required launch assets, no repository checkout,
  development tests/plans, source maps, user credentials or browser sessions.
- Windows extracted-package install and MCP protocol smoke tests use fake providers
  and temporary folders. They do not prove real provider accounts are signed in.
- Linux payload integrity is checked. Native Linux desktop/keyring/onboarding and
  live Antigravity account interactions are not claimed as verified on Windows.
- Browser account sessions, provider availability and host model choice are user-
  dependent. No live inference traffic was generated to manufacture diversity.

GUI shortcuts for API Keys and Antigravity hide only the package-owned PowerShell
console. Errors still produce an attention dialog. OpenCode and usage terminals,
security prompts, browser sign-in and Antigravity onboarding remain interactive.
