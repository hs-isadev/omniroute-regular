# OmniRoute Regular 0.2.6 — one-click Windows/Linux setup

Download the feature-complete package from the top-level links below. Each
archive bundles the Node runtime, production dependencies, MCP server, portable
skills, provider adapters, and setup scripts. Antigravity itself is not
redistributed; setup opens its official download page and keeps its login in
the official app.

- [Windows x64 one-click package](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.2.6-regular.5/OmniRoute-Regular-0.2.6-windows-x64.zip) · [SHA-256](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.2.6-regular.5/OmniRoute-Regular-0.2.6-windows-x64.zip.sha256)
- [Linux x64 one-click package](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.2.6-regular.5/OmniRoute-Regular-0.2.6-linux-x64.tar.gz) · [SHA-256](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.2.6-regular.5/OmniRoute-Regular-0.2.6-linux-x64.tar.gz.sha256)
- [Release notes and verification](https://github.com/hs-isadev/omniroute-regular/releases/tag/v0.2.6-regular.5)

For a download-and-install flow without manually opening the release page, run
[`Download-OmniRoute-Regular.cmd`](Download-OmniRoute-Regular.cmd) on Windows or
[`Download-OmniRoute-Regular.sh`](Download-OmniRoute-Regular.sh) on Linux.

## One-click behavior

1. Download the matching archive or run the root downloader above.
2. Run `Setup.cmd` (Windows) or `Setup.sh` (Linux) inside the extracted package.
3. Setup installs the bundled runtime, preserves existing local data, opens the
   provider key flow, and starts the guided host setup.
4. Setup also writes one owned per-user startup entry for the shared foreground
   browser adapter: Windows Startup on login or Linux desktop autostart. The
   adapter opens its isolated browser profile on every desktop login; you sign
   in once with your own accounts. No cookies, credentials, or sessions ship in
   the archive.

The package contains no API keys, browser sessions, vaults, or personal
projects. Browser credentials stay in the dedicated local profile and are not
copied from the normal browser profile. Free-provider quotas and service terms
apply; this is not unlimited inference.

Regular mode automatically enables the bounded nano-specialist swarm for
eligible small coding/light tasks. It uses up to six low-context workers in
paced waves, then performs one attributed synthesis; no extra switch is needed
on a fresh install.

The package also installs the portable hackathon skill pack into the selected
workspace's `.agents/skills/` directory for Antigravity and OpenCode. It
includes practical routing, implementation, debugging, review, verification,
repository-mapping, accessibility, frontend, and scraping skills. The heavy
opinionated `taste` and measurement-only `skillopt` skills are intentionally
excluded. Setup checks for existing Codex and OpenCode installations and
applies the managed integration only when found; absent hosts are left alone.
Codex can also be attached explicitly with `omni integrate codex --user --apply`.

## Historical 0.5.0 documentation

The section below is retained for migration context only. The current package
uses one shared foreground browser session for consumer sign-in and
diagnostics; it no longer describes six separate background consumer windows.

OmniRoute builds one download for Windows 10/11 x64 and Linux x64 desktops. It
installs or connects six routes:

- OpenCode uses OmniRoute as its main model/router.
- Antigravity stays the main agent and calls OmniRoute workers through MCP.
- Codex and Claude Code stay the main agents and call OmniRoute workers through
  MCP when those hosts are already installed.
- Short text and coding requests can use a signed-in Claude web account through
  a dedicated local browser profile. These requests contain only the user's
  natural prompt—no role labels or system-like preamble.
- Short text and coding requests can also use signed-in Z.AI GLM models through
  a second dedicated local browser profile and loopback-only connection.

No API keys, browser sessions, vaults, or personal projects are included. You
bring your own provider keys and sign into Antigravity, Claude, and Z.AI
yourself. Browser profiles remain local to the installed machine.

## Quick setup (0.5.0)

1. Build or download `OmniRoute-Dual-0.5.0`, then extract the whole
   folder.
2. Windows: double-click `Install-Windows.cmd`.
   Linux: run `sh Install-Linux.sh` from the extracted directory.
3. In the graphical **API Keys** window, use **Get key**, paste any keys you
   want, confirm free-account settings, and choose **Save and test**. One
   working provider is enough; blank fields preserve existing saved keys.
4. Complete the one-time Claude and Z.AI logins in their separate dedicated
   browser windows, then complete Antigravity's sign-in when it opens.

Setup obtains official Antigravity, installs the bundled pinned OpenCode and
OmniRoute runtime, connects MCP, and creates launchers. OS security, admin,
desktop-keyring, browser login, and Antigravity onboarding prompts can still
require approval. The current shared browser session is isolated from normal
browser tabs and profiles and stays foreground for diagnostics. See the
release's `VERIFICATION.md` for the exact tests and limitations.

## What changed in 0.5.0

This release adds local Claude and Z.AI GLM browser consumers to the 0.4.0 BYOK,
OpenCode, Antigravity, Codex, and Claude Code package. Both browser routes are
limited to small text/coding work, use separate isolated loopback ports, and
start from per-user autostart entries. Opera GX is preferred on Windows; Opera,
Chrome, or Chromium can be used on Linux. Browser access is account, quota, and
terms dependent and is not presented as an API key or unlimited provider.

## Legacy Antigravity-only 0.2.x documentation

Preview release: Windows/Linux installer and MCP protocol checks pass. Real Antigravity account/tool-adherence testing and a Linux desktop-keyring round trip are still pending. See the included test evidence before relying on this for important work.

Regular v0.2 uses the official Google Antigravity app (or official agy CLI) as the host. Antigravity calls OmniRoute's local stdio MCP server; OmniRoute selects a free API worker; Antigravity reviews the result and handles files, commands and tests.

No OpenCode, Codex, Claude Code, separate daemon or developer toolchain is required. Node is bundled. Antigravity itself is **not bundled**: install it from [Google](https://antigravity.google/download) and sign in there.

This is quota-limited, not unlimited free frontier inference. The host still consumes Antigravity quota; workers consume their providers' quotas. API keys/service tokens do not grant consumer-login or subscription access. Existing GPT/Claude integrations are separate.

## Windows x64

1. Download the Windows ZIP and its SHA-256 file from a trusted release source. Check `Get-FileHash .\OmniRoute-Regular-0.2.6-windows-x64.zip -Algorithm SHA256` against it, then extract the ZIP.
2. Install/sign in to official Antigravity. Choose a host model your account offers on the free plan; do not enable paid credits/overages.
3. Run `Setup.cmd`. It installs for your Windows user and opens **Notepad with API key slots and signup links**. Providers already saved in this installation are marked; their secret values are never shown. One suitable free provider is enough. Blank slots retain saved keys.
4. Fill only the keys you want to add/change, **save and close Notepad**, then return to setup. Type **yes** to confirm free-plan accounts (no billing/overages/BYOK/top-up) and import. Optionally test Kimi/Qwen candidates. Short validation requests use free quota; successful keys are encrypted and removed from the text file. Failed entries stay for retry.
5. Enter an existing project folder, or press Enter for a starter workspace. Review the preview, then type **yes** to connect and open Antigravity. Declining import stops setup. No extra commands are needed.

To resume later, run `%LOCALAPPDATA%\OmniRouteRegular\Connect.cmd`. To add keys only, run `%LOCALAPPDATA%\OmniRouteRegular\Settings.cmd`. Blank fields keep saved keys, so you do not need to paste every key again.

**Text-file risk:** Notepad/editor session backups, clipboard history, disk snapshots and malware can retain plaintext. Disable editor session recovery before entering keys. Cleanup is not secure erasure. For less exposure, use `Connect.cmd --masked` or `Settings.cmd` instead. Files are created under `%LOCALAPPDATA%\OmniRouteRegular-KeyEntry\<profile-id>\credentials.txt`, outside the package/project, with current-user-only permissions. Cancelled/failed imports leave pending plaintext there. The current Setup path also installs the owned browser-consumer startup entry described above.

Advanced/manual launch remains available:

```powershell
& "$env:LOCALAPPDATA\OmniRouteRegular\Launch.cmd" --workspace "C:\path\to\project"
& "$env:LOCALAPPDATA\OmniRouteRegular\Launch.cmd" --workspace "C:\path\to\project" --apply
```

The second command merges workspace MCP/rules and opens Antigravity. Restart/reconnect its MCP servers if the project was already open. Check that `omniroute_regular` exposes `omni_route`, `omni_models`, and `omni_routes`; confirm the workspace rule is Always On. The single desktop launcher previews the package's default workspace; add `--apply` to connect it.

## Linux x64 (glibc desktop)

Install official Antigravity separately and sign in. An **unlocked Secret Service keyring**, session D-Bus, and `secret-tool` are required to save credentials. On Ubuntu the packages are `libsecret-tools` and `gnome-keyring`; install them through your system package manager if absent. Never run OmniRoute setup with sudo. ARM, Alpine/musl and headless key storage are unsupported.

```sh
sha256sum -c OmniRoute-Regular-0.2.2-linux-x64.tar.gz.sha256
tar -xzf OmniRoute-Regular-0.2.2-linux-x64.tar.gz
cd OmniRoute-Regular-0.2.2-linux-x64
sh Setup.sh
```

Setup opens the system desktop text editor (via xdg-open when available) with the same key slots. Save and close it, then confirm import in the terminal. It asks for your project, previews integration, and requires **yes** before launch. Resume with `"$HOME/.local/share/OmniRouteRegular/Connect.sh"`; use `Connect.sh --masked` or `Settings.sh` for hidden terminal key entry. If you set XDG_DATA_HOME, use `$XDG_DATA_HOME/OmniRouteRegular` for the install; text input stays under `$HOME/.local/share/OmniRouteRegular-KeyEntry/<profile-id>/credentials.txt` with directory 0700/file 0600. There is no plaintext **vault** fallback; the editor file is temporary plaintext input. `Setup.ps1 -NoWizard` and `sh Setup.sh --no-wizard` still provide noninteractive install-only mode.

## First request

In Antigravity ask:

> Use omniroute_regular's omni_route with routingMode="regular" to explain what a variable is in one sentence. Show the worker badge and route ID.

Then try a bounded coding task with relevant code and requirements. The host must verify suggestions before applying them. Rules guide behavior; they do not intercept every request or guarantee host compliance.

## Providers and routing

The setup exposes **22 hosted API-key profiles** (free plans, free-model offers, or evaluation tiers). Hugging Face and Vercel credit-based profiles remain disabled in strict Regular mode, even when their keys are retained. See [provider/authentication guide](docs/free-provider-expansion.md). Stronger candidates include NVIDIA Kimi K2.6 and OpenRouter Qwen3 Coder free; their individual connectivity check must pass before activation. Coding quality is not certified by that check. No 120B ceiling is imposed.

Runtime enforces compiled provider endpoints and free-model IDs before loading keys; editing prices to zero cannot admit an unlisted model. Account free-plan eligibility is still your responsibility: connectivity does not prove billing status, and there is no universal billing-status API. Limits stop/fallback only among eligible free workers. No claim of unlimited access, zero security risk, or superiority over every installer is made. See [security/test evidence](docs/testing/key-editor.tdd.md).

Simple worker questions use a lightweight preference; coding uses a quality preference. Complex coding has a conservative configured-tier floor across fallbacks. Provider-first fallback tries adequate alternatives on the same provider before another. Model tiers/order are provisional, not a benchmark leaderboard. Host-model choice stays in Antigravity.

A machine-local `claude-consumer` profile can call the separate browser-session
adapter over MCP stdio. It is disabled in portable defaults, claims only text
and coding, and is hard-capped at the small task class. See
[Claude consumer provider](docs/claude-consumer-provider.md).

A separate machine-local `zai-consumer` profile can call signed-in Z.AI GLM
models through its own browser-session adapter. It has the same small-task and
text/coding limits and never shares Claude's browser profile or port. See
[Z.AI consumer provider](docs/zai-consumer-provider.md).

OpenCode regular mode now gets a stable local session ID and OmniRoute can keep
durable, compacted session files under the runtime root. Regular small coding
requests may also fan out six tiny, low-context checks in paced waves; browser
consumer adapters remain opt-in, small-task-only, and serialized. The setup key
editor exposes six slots per provider. See
[open-source additions and session storage](docs/opensource-setup-additions.md).

## Updates, rollback, troubleshooting

See [full setup and migration guide](docs/antigravity-regular.md), including workspace detachment, version rollback and data-preserving uninstall. [Test evidence](docs/testing/antigravity-regular.tdd.md) distinguishes mock/protocol checks from actual Antigravity tests.

Packages include file checksums, dependency/license inventory and source provenance. They are unsigned; a checksum detects corruption, not a malicious replacement from an untrusted source. Never share your installed `data` directory.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run test:regular
npm run package:regular
npm run test:package
```

Build the Linux payload from Windows with `node scripts/package-regular.mjs --target=linux-x64`; this is not itself a Linux runtime test. Source retains legacy OpenCode/daemon code for separate integrations, but the Regular launcher never starts it.
