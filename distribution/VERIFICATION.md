# OmniRoute package verification notes

- TypeScript build/typecheck passes.
- Core, routing, integration and security tests pass, including least-dispatched
  provider/model diversity, strict pins, task-class/capability/context filtering,
  quota/cooldown/failure handling, concurrent requests, and content-free diagnostics.
- Bounded delegation tests cover packet minimization, known/unknown context limits,
  exact boundaries, response/instruction/synthesis reserves, host-owned synthesis,
  and suppression of coupled or oversized work.
- The installed Windows MCP server completes initialize/tools-list and advertises
  omni_route, omni_models, omni_routes and omni_usage. The shareable 0.6.8 setup
  keeps consumer-browser providers disabled.
- The family archive is inspected against its manifest and checksums. It contains
  generated runtime code and required launch assets, no repository checkout,
  development tests/plans, source maps, user credentials or browser sessions.
- Windows extracted-package tests install 0.6.6-private.8 then 0.6.6-private.12
  into a path containing spaces, verify the bundled Node executable and MCP
  entrypoint, repair the exact Antigravity and OpenCode registrations, complete
  initialize/tools-list using each registered command, roll back and repeat both
  handshakes, then roll forward and repeat them again.
- Setup disables all browser-consumer providers and removes recognized OmniRoute
  consumer-browser autostart entries on Windows/Linux. It preserves unknown
  same-name startup files and every browser profile/sign-in file.
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
  current stored counts. Runtime pools may switch slots after authentication
  failures; provider-wide quota responses cool every model/key for that provider.
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
- The historical 0.6.6-private.12 extracted-family smoke scanned 2,779 archive entries,
  verified both OS manifests, and completed three registered Antigravity plus
  three OpenCode MCP initialize/tools-list handshakes on Windows. Its provider
  request used a fake provider; no live inference ran. Native Linux installation
  was not tested. The smoke also verified update/rollback, the source archive,
  setup UI fields, and safe optional-Devin failure handling.
- Provider availability and host model choice are user-dependent. Browser
  consumers are disabled in the 0.6.8 shareable package.

Local source gates on 2026-09-29: `npm run test:regular` passed 160 tests with
two skips. The Windows/Linux release archive is also validated against its
per-platform SHA-256 manifests before the extracted family-package smoke test.

GUI shortcuts for API Keys and Antigravity hide only the package-owned PowerShell
console. Errors still produce an attention dialog. OpenCode and usage terminals,
security prompts and Antigravity onboarding remain interactive.

The .12 setup repairs blank OmniRoute and Antigravity JSON configuration files
by backing up the empty file and writing a safe default. Malformed non-empty JSON
is rejected with the exact file path; the original file is left unchanged. This
prevents a partial/empty host config from aborting setup with an unhelpful
“Unexpected end of JSON input” message. A failed optional Devin CLI checksum
remains a warning and does not cause this config failure. The regression suite
passed 165 distribution tests (two platform-specific skips), including empty
and malformed config recovery. The main `npm test` suite passed 193 tests.

OmniRoute 0.6.8 forwards `harness` from both OS launchers to the bundled CLI. After
a successful update it keeps only the active version and removes older verified,
package-owned runtimes; previous-version rollback is not available. Keys/settings remain in the
separate data folder. Extra or modified runtime files are left untouched. The TDD
evidence in `docs/testing/harness-launch-and-version-prune.tdd.md` records the
new cleanup and browser-disable checks. For 0.6.8, the focused installer,
shortcut, and setup suites passed (6/6, 3/3, and 32/32); `npm run test:regular`
passed 179 tests with two platform-specific skips, and `npm test` passed 197/197.
Both payload manifests verified (1,383 Windows files and 1,380 Linux files).
The extracted ZIP smoke scanned 2,781 files, installed the Windows package in a
temporary location, verified pruning and browser-startup migration, and completed
two registered MCP handshakes each for Antigravity and OpenCode using a fake
provider. No live inference ran; native Linux installation was not tested.
