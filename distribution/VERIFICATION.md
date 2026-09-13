# OmniRoute 0.6.5-private.1 verification

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
- Windows extracted-package tests install 0.6.4 then 0.6.5 into a path containing
  spaces, verify the bundled Node executable and MCP entrypoint, repair the exact
  Antigravity registration, complete initialize/tools-list, roll back and repeat
  the registered-command handshake, then roll forward and repeat it again.
- Enabled browser-consumer runtime paths are repaired to the active version before
  host registration without changing their enablement, endpoint, models or limits.
- A separate live check on 2026-09-13 used only `Reply with OK only.` against
  enabled, configured, free-policy-approved API routes. Kilo Auto Free succeeded.
  Z.AI GLM 4.7 Flash returned HTTP 429 before GLM 4.5 Flash succeeded. OpenCode
  Zen's three configured free IDs returned HTTP 400. Mistral and every other
  disabled or unconfigured API provider were not tested. Only status/reason codes,
  HTTP status, model/provider IDs, source hosts and timing metadata were recorded.
- Linux payload integrity is checked. Native Linux desktop/keyring/onboarding and
  live Antigravity account interactions are not claimed as verified on Windows.
- Browser account sessions, provider availability and host model choice are user-
  dependent. Browser consumers were not used for the API validation and retain
  their existing task-class, capability, context, serialization and pacing limits.

Local source gates on 2026-09-13: TypeScript typecheck/build passed; 185/185 core
tests passed; 15/15 deterministic evaluation fixtures passed; distribution tests
passed 139 with two platform-inapplicable skips and no failures; 15/15 security and
vault tests passed; and `npm audit --omit=dev` reported zero vulnerabilities.

GUI shortcuts for API Keys and Antigravity hide only the package-owned PowerShell
console. Errors still produce an attention dialog. OpenCode and usage terminals,
security prompts, browser sign-in and Antigravity onboarding remain interactive.
