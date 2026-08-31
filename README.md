# OmniRoute Regular — Antigravity + free MCP workers

Preview release: Windows/Linux installer and MCP protocol checks pass. Real Antigravity account/tool-adherence testing and a Linux desktop-keyring round trip are still pending. See the included test evidence before relying on this for important work.

Regular v0.2 uses the official Google Antigravity app (or official agy CLI) as the host. Antigravity calls OmniRoute's local stdio MCP server; OmniRoute selects a free API worker; Antigravity reviews the result and handles files, commands and tests.

No OpenCode, Codex, Claude Code, separate daemon or developer toolchain is required. Node is bundled. Antigravity itself is **not bundled**: install it from [Google](https://antigravity.google/download) and sign in there.

This is quota-limited, not unlimited free frontier inference. The host still consumes Antigravity quota; workers consume their providers' quotas. API keys/service tokens do not grant consumer-login or subscription access. Existing GPT/Claude integrations are separate.

## Windows x64

1. Download the Windows ZIP and its SHA-256 file from a trusted release source. Check `Get-FileHash .\OmniRoute-Regular-0.2.0-windows-x64.zip -Algorithm SHA256` against it, then extract the ZIP.
2. Install/sign in to official Antigravity. Choose a host model your account offers on the free plan; do not enable paid credits/overages.
3. Run `Setup.cmd`. It installs for your Windows user and opens the **masked Settings window**. Put your own provider keys there—not in chat or shell commands. Any one suitable provider is enough; OpenRouter is optional.
4. Optionally tick the extra Kimi/Qwen candidate test. Save validates short requests, consuming a little free quota. Blank fields retain saved keys.
5. Open PowerShell and preview your chosen project:

```powershell
& "$env:LOCALAPPDATA\OmniRouteRegular\Launch.cmd" --workspace "C:\path\to\project"
& "$env:LOCALAPPDATA\OmniRouteRegular\Launch.cmd" --workspace "C:\path\to\project" --apply
```

The second command merges workspace MCP/rules and opens Antigravity. Restart/reconnect its MCP servers if the project was already open. Check that `omniroute_regular` exposes `omni_route`, `omni_models`, and `omni_routes`; confirm the workspace rule is Always On. The desktop shortcut previews the package's default workspace; add `--apply` to connect it.

## Linux x64 (glibc desktop)

Install official Antigravity separately and sign in. An **unlocked Secret Service keyring**, session D-Bus, and `secret-tool` are required to save credentials. On Ubuntu the packages are `libsecret-tools` and `gnome-keyring`; install them through your system package manager if absent. Never run OmniRoute setup with sudo. ARM, Alpine/musl and headless key storage are unsupported.

```sh
sha256sum -c OmniRoute-Regular-0.2.0-linux-x64.tar.gz.sha256
tar -xzf OmniRoute-Regular-0.2.0-linux-x64.tar.gz
cd OmniRoute-Regular-0.2.0-linux-x64
sh Setup.sh
"$HOME/.local/share/OmniRouteRegular/Launch.sh" --workspace "/path/to/project"
"$HOME/.local/share/OmniRouteRegular/Launch.sh" --workspace "/path/to/project" --apply
```

If you set XDG_DATA_HOME, use `$XDG_DATA_HOME/OmniRouteRegular` instead. Linux Settings hides all input, including stars; paste each requested API key/token locally. There is no plaintext fallback.

## First request

In Antigravity ask:

> Use omniroute_regular's omni_route with routingMode="regular" to explain what a variable is in one sentence. Show the worker badge and route ID.

Then try a bounded coding task with relevant code and requirements. The host must verify suggestions before applying them. Rules guide behavior; they do not intercept every request or guarantee host compliance.

## Providers and routing

The local editor supports 12 opt-in providers, with different access conditions. See [provider/authentication guide](docs/free-provider-expansion.md). Stronger candidates include NVIDIA Kimi K2.6 and OpenRouter Qwen3 Coder free; their individual connectivity check must pass before activation. Coding quality is not certified by that check. No 120B ceiling is imposed.

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
