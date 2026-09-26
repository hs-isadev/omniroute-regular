# OmniRoute 0.6.6-private.9 verification

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
- Windows extracted-package tests install 0.6.6-private.8 then 0.6.6-private.9
  into a path containing spaces, verify the bundled Node executable and MCP
  entrypoint, repair the exact Antigravity and OpenCode registrations, complete
  initialize/tools-list using each registered command, roll back and repeat both
  handshakes, then roll forward and repeat them again.
- Enabled browser-consumer runtime paths are repaired to the active version before
  host registration without changing their enablement, endpoint, models or limits.
- Existing package-owned browser-consumer startup entries are migrated to the
  stable installed `Launch.ps1`/`Launch.sh` wrapper. The wrapper resolves the
  current `active-version.txt`, validates its bundled Node and adapter files,
  and emits an actionable repair message instead of a missing-executable dialog.
  The regression suite covers the Windows VBS migration, Linux desktop entry,
  repeat repair, active-version changes, and preservation of unknown startup data.
- The package includes eleven compact, portable skills: focused implementation,
  focused code review, root-cause debugging, verify change, TDD workflow, coding
  standards, search first, security review, context budget, OmniRoute-first
  delegation, and GitHub package release. Setup installs them globally for Codex, OpenCode and Antigravity,
  repeats safely, and preserves existing same-named skills. Codex and OpenCode
  also receive persistent OmniRoute-first rules; Antigravity already receives
  its global rules. The package smoke test verifies all eleven skills in both OS
  bundles and their installation for every host.
- The masked setup window exposes five independently validated slots per provider,
  preserves legacy credentials as slot 1, and reports accepted/failed slots plus
  current stored counts. Runtime pools rotate slots and cool down auth/quota failures.
- The packaged OpenCode launcher disables prior-session replay by default while
  preserving explicit launch arguments. This avoids an unstable UI replay path;
  the isolated strict-free configuration and current worker routing are unchanged.
- `omni harness opencode --mode regular` is covered by a local-only integration
  test using a temporary daemon and a fake OpenCode executable: it uses the
  loopback OmniRoute gateway and does not require or inherit an OpenRouter key.
- On Windows x64, setup may install the official Devin CLI updater after both
  its pinned SHA-256 and Authenticode publisher are verified. The pinned hash
  matches the current updater; a stale cached installer is refreshed. If the
  optional download, checksum, or signature check fails, Devin is skipped with
  a warning and OmniRoute setup continues without running the file. The
  isolated regression test mocks a bad download and confirms it is not executed.
  Setup creates visible launchers and registers only a local
  `omniroute_regular` MCP in regular mode. Package tests verify registered
  commands and MCP paths without claiming a Devin login, model availability,
  or Fusion success.
- Devin Fusion is paid/metered according to Devin's own product policy and is
  deliberately not enabled. Astra, Sol, Terra and Antigravity model availability
  remains controlled by the user's host/account entitlement; OmniRoute neither
  imports those models nor enables paid fallbacks.
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

Local source gates on 2026-09-26: `npm run test:regular` passed 156 tests with
two platform-inapplicable skips; `npm test` passed the TypeScript build and all
193 core/integration/security tests. The Windows/Linux release archive is also
validated against its per-platform SHA-256 manifests before the extracted
family-package smoke test.

GUI shortcuts for API Keys and Antigravity hide only the package-owned PowerShell
console. Errors still produce an attention dialog. OpenCode and usage terminals,
security prompts, browser sign-in and Antigravity onboarding remain interactive.
