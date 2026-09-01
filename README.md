# OmniRoute Dual — OpenCode + Antigravity

The current `0.3.0` release is one download for Windows 10/11 x64 and Linux
x64 desktops. It installs both modes:

- OpenCode uses OmniRoute as its main model/router.
- Antigravity stays the main agent and calls OmniRoute workers through MCP.

No API keys, login sessions, vaults, or personal projects are included. You
bring your own free/evaluation provider keys and sign into the official Google
Antigravity app yourself.

## Quick setup (0.3.0)

1. Download `OmniRoute-Dual-0.3.0.zip` and its `.sha256` file from the latest
   GitHub release, then extract the whole ZIP.
2. Windows: double-click `Install-Windows.cmd`.
   Linux: run `sh Install-Linux.sh` from the extracted directory.
3. In the graphical **API Keys** window, use **Get key**, paste any keys you
   want, confirm free-account settings, and choose **Save and test**. One
   working provider is enough; blank fields preserve existing saved keys.
4. Complete Antigravity's official sign-in when it opens. Launch either
   **OmniRoute OpenCode** or **OmniRoute Antigravity** afterward.

Setup obtains official Antigravity, installs the bundled pinned OpenCode and
OmniRoute runtime, connects MCP, and creates launchers. OS security, admin,
desktop-keyring, and Antigravity onboarding prompts can still require approval.
See the release's `VERIFICATION.md` for the exact tests and limitations.

## Unreleased 0.4.0 source

The next source release adds opt-in Cerebras and SambaNova free-tier API-key
profiles, 12-provider graphical key entry, and an upstream MIT notice. Their
adapters pass mock-backed discovery, completion, and streaming tests, but they
have not yet passed a live owner-key check. The published 0.3.0 download remains
the tested release until 0.4.0 is packaged, independently reviewed, and sealed.

## Legacy Antigravity-only 0.2.x documentation

Preview release: Windows/Linux installer and MCP protocol checks pass. Real Antigravity account/tool-adherence testing and a Linux desktop-keyring round trip are still pending. See the included test evidence before relying on this for important work.

Regular v0.2 uses the official Google Antigravity app (or official agy CLI) as the host. Antigravity calls OmniRoute's local stdio MCP server; OmniRoute selects a free API worker; Antigravity reviews the result and handles files, commands and tests.

No OpenCode, Codex, Claude Code, separate daemon or developer toolchain is required. Node is bundled. Antigravity itself is **not bundled**: install it from [Google](https://antigravity.google/download) and sign in there.

This is quota-limited, not unlimited free frontier inference. The host still consumes Antigravity quota; workers consume their providers' quotas. API keys/service tokens do not grant consumer-login or subscription access. Existing GPT/Claude integrations are separate.

## Windows x64

1. Download the Windows ZIP and its SHA-256 file from a trusted release source. Check `Get-FileHash .\OmniRoute-Regular-0.2.2-windows-x64.zip -Algorithm SHA256` against it, then extract the ZIP.
2. Install/sign in to official Antigravity. Choose a host model your account offers on the free plan; do not enable paid credits/overages.
3. Run `Setup.cmd`. It installs for your Windows user and opens **Notepad with API key slots and signup links**. Providers already saved in this installation are marked; their secret values are never shown. One suitable free provider is enough. Blank slots retain saved keys.
4. Fill only the keys you want to add/change, **save and close Notepad**, then return to setup. Type **yes** to confirm free-plan accounts (no billing/overages/BYOK/top-up) and import. Optionally test Kimi/Qwen candidates. Short validation requests use free quota; successful keys are encrypted and removed from the text file. Failed entries stay for retry.
5. Enter an existing project folder, or press Enter for a starter workspace. Review the preview, then type **yes** to connect and open Antigravity. Declining import stops setup. No extra commands are needed.

To resume later, double-click **OmniRoute Regular Finish Setup** on your desktop, or run `%LOCALAPPDATA%\OmniRouteRegular\Connect.cmd`. To add keys only, use **OmniRoute Regular Settings**. Blank fields keep saved keys, so you do not need to paste every key again.

**Text-file risk:** Notepad/editor session backups, clipboard history, disk snapshots and malware can retain plaintext. Disable editor session recovery before entering keys. Cleanup is not secure erasure. For less exposure, use `Connect.cmd --masked` or the Settings shortcut instead. Files are created under `%LOCALAPPDATA%\OmniRouteRegular-KeyEntry\<profile-id>\credentials.txt`, outside the package/project, with current-user-only permissions. Cancelled/failed imports leave pending plaintext there. No OS-login startup task is added.

Advanced/manual launch remains available:

```powershell
& "$env:LOCALAPPDATA\OmniRouteRegular\Launch.cmd" --workspace "C:\path\to\project"
& "$env:LOCALAPPDATA\OmniRouteRegular\Launch.cmd" --workspace "C:\path\to\project" --apply
```

The second command merges workspace MCP/rules and opens Antigravity. Restart/reconnect its MCP servers if the project was already open. Check that `omniroute_regular` exposes `omni_route`, `omni_models`, and `omni_routes`; confirm the workspace rule is Always On. The desktop shortcut previews the package's default workspace; add `--apply` to connect it.

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

Published Regular 0.3.0 offers **10 opt-in free-plan/free-endpoint/evaluation providers**. Unreleased 0.4.0 source offers 12 by adding Cerebras and SambaNova. Hugging Face and Vercel credit-based profiles are disabled, even when their keys are retained. See [provider/authentication guide](docs/free-provider-expansion.md). Stronger candidates include NVIDIA Kimi K2.6 and OpenRouter Qwen3 Coder free; their individual connectivity check must pass before activation. Coding quality is not certified by that check. No 120B ceiling is imposed.

Runtime enforces compiled provider endpoints and free-model IDs before loading keys; editing prices to zero cannot admit an unlisted model. Account free-plan eligibility is still your responsibility: connectivity does not prove billing status, and there is no universal billing-status API. Limits stop/fallback only among eligible free workers. No claim of unlimited access, zero security risk, or superiority over every installer is made. See [security/test evidence](docs/testing/key-editor.tdd.md).

Simple worker questions use a lightweight preference; coding uses a quality preference. Complex coding has a conservative configured-tier floor across fallbacks. Provider-first fallback tries adequate alternatives on the same provider before another. Model tiers/order are provisional, not a benchmark leaderboard. Host-model choice stays in Antigravity.

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
