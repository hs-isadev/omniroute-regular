# OmniRoute 0.6.6-private.2 verification

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
- Windows extracted-package tests install 0.6.5 then 0.6.6 into a path containing
  spaces, verify the bundled Node executable and MCP entrypoint, repair the exact
  Antigravity and OpenCode registrations, complete initialize/tools-list using
  each registered command, roll back and repeat both handshakes, then roll
  forward and repeat them again.
- Enabled browser-consumer runtime paths are repaired to the active version before
  host registration without changing their enablement, endpoint, models or limits.
- Existing package-owned browser-consumer autostart files are also rewritten to
  the active verified Node/shared-session paths; unrecognized content fails closed.
- The masked setup window exposes five independently validated slots per provider,
  preserves legacy credentials as slot 1, and reports accepted/failed slots plus
  current stored counts. Runtime pools rotate slots and cool down auth/quota failures.
- A live check on 2026-09-14 used only `Reply with OK only.` against enabled,
  configured, free-policy-approved API routes. Kilo, Mistral, Cohere, Cloudflare,
  Z.AI, OpenRouter, Gemini and Groq succeeded. OpenCode Zen's three documented free
  chat IDs returned HTTP 400. Cerebras and SambaNova were unconfigured; NVIDIA and
  credit/paid profiles were deliberately not tested. Only safe status metadata was
  recorded.
- Linux payload integrity is checked. Native Linux desktop/keyring/onboarding and
  live Antigravity account interactions are not claimed as verified on Windows.
- Browser account sessions, provider availability and host model choice are user-
  dependent. Browser consumers were not used for the API validation and retain
  their existing task-class, capability, context, serialization and pacing limits.

Local source gates on 2026-09-13: TypeScript typecheck/build passed; 185/185 core
tests passed; 15/15 deterministic evaluation fixtures passed; distribution tests
passed 141 with two platform-inapplicable skips and no failures; 15/15 security and
vault tests passed; and `npm audit --omit=dev` reported zero vulnerabilities.

GUI shortcuts for API Keys and Antigravity hide only the package-owned PowerShell
console. Errors still produce an attention dialog. OpenCode and usage terminals,
security prompts, browser sign-in and Antigravity onboarding remain interactive.
