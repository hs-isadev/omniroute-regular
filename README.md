# OmniRoute Regular for Windows and Linux

OpenCode coding/chat harness + OmniRoute free-provider workers. No Codex or Claude subscription required. Bring your own API keys; no credentials are distributed.

## Install (Windows 10/11, x64)

1. Download the **OmniRoute-Regular-0.1.2-windows-x64.zip** release asset (not GitHub's "Source code" ZIP).
2. Right-click the ZIP, choose **Extract All**, open the extracted folder, and double-click **Setup.cmd**. No administrator account, Node installation, or terminal commands are required. Windows may show an unsigned-download warning; inspect the source and checksum before deciding whether to run it.
3. In the local masked form, paste **your own OpenRouter API key**. Add any optional provider keys below. Confirm your accounts have no paid overages/auto top-up, then click **Validate and save**. Validation makes one small API request per supplied provider, consuming free quota. It can take a few minutes.
4. Open **OmniRoute Regular** on the desktop. Use **OmniRoute Regular Settings** to add/change keys later. Blank fields keep saved keys; failed replacement keys do not overwrite working ones.

Setup bundles Node.js 22.23.2 and OpenCode 1.18.25. An internet connection is required to validate keys and use the models. Provider account creation, region/age eligibility checks, and accepting provider terms cannot be automated for you.

## Install (Linux desktop, x64)

Use **OmniRoute-Regular-0.1.2-linux-x64.tar.gz**, not the Windows ZIP. Linux CI targets Ubuntu 24.04 x64 with GNOME Keyring. Other compatible glibc desktops may work but are not independently certified. ARM, Alpine/musl and headless/SSH-only setups are not supported by this installer. Node and OpenCode are bundled; no Node/npm installation is needed.

1. Sign in to your normal desktop account. You need `secret-tool` and an unlocked Secret Service keyring (normally GNOME Keyring). If missing, Ubuntu/Debian users can install prerequisites with `sudo apt install libsecret-tools gnome-keyring`, then sign out and back in. This prerequisite may need an administrator; OmniRoute setup itself does not.
2. Download and extract the Linux tarball. Open a terminal in the extracted folder and run `sh Setup.sh` **without sudo**.
3. Type `yes` to confirm free-only account settings, then paste your own API keys into the hidden prompts. Nothing you type is echoed, including stars. OpenRouter is required. Press Enter to skip optional fields or keep saved keys. Cloudflare needs both its token and account ID.
4. Start the harness with:

   ```sh
   sh "${XDG_DATA_HOME:-$HOME/.local/share}/OmniRouteRegular/Launch.sh"
   ```

   To add/change keys later, run `Settings.sh` from the same folder. Close the running harness before changing keys or reinstalling.

Linux setup is terminal-based, not a Windows-style GUI. It installs only into `${XDG_DATA_HOME:-$HOME/.local/share}/OmniRouteRegular`, with private directory/file permissions. No startup service, global PATH change, or desktop shortcut is installed. Run `Launch.sh` whenever you want regular mode.

Keys are AES-256-GCM encrypted; the master key is held by your desktop Secret Service. The vault file contains only a keyring reference, never a plaintext master key. If the keyring is unavailable or locked, setup/launch fails closed with no plaintext fallback. Use a password-protected keyring; OmniRoute cannot strengthen an unencrypted keyring. An unlocked session remains accessible to programs running as your user. See the [upstream Secret Service API](https://gnome.pages.gitlab.gnome.org/libsecret/libsecret-simple-api.html).

Linux reinstalls verify the payload, stage a new version and switch `current` while retaining `data`, `workspace`, `opencode-user` and previous binaries under `versions`. Close OpenCode first. To roll back binaries, repoint `current` to the retained previous version; never delete or move `data` during rollback. This is not an automatic updater. Windows keeps its existing installer behavior below.

Do not copy an installed vault to another machine: its keyring entry is not included. Your brother must run setup and enter his own keys. To uninstall Linux, close the harness and remove only this application's installation folder; this removes its chat history too. Its master-key entry may remain in your desktop Passwords and Keys app as **OmniRoute encrypted vault**. Remove only the corresponding entry if no other retained vault needs it.

## Where to get keys

| Provider | Key page | Notes |
|---|---|---|
| **OpenRouter (required)** | [Create API key](https://openrouter.ai/settings/keys) | The OpenCode host uses only `openrouter/free`; free-model availability and rate limits vary. |
| Groq | [API keys](https://console.groq.com/keys) | Optional free-plan worker; coding prefers GPT-OSS 120B when available. |
| Google Gemini | [AI Studio keys](https://aistudio.google.com/apikey) | Optional; use an eligible unbilled/free-tier project. Region/account restrictions apply. |
| Mistral | [Console keys](https://console.mistral.ai/api-keys/) | Optional; use the free/evaluation plan. |
| Cohere | [Dashboard keys](https://dashboard.cohere.com/api-keys) | Optional trial/evaluation key, not a paid production key; trial terms apply. |
| Cloudflare Workers AI | [Dashboard](https://dash.cloudflare.com/) | Optional Workers AI API token and the **32-character account ID**, not an account password. Use the free allowance with paid overages disabled. |
| Hugging Face | [Access tokens](https://huggingface.co/settings/tokens) | Optional token with Inference Providers permission. Uses limited included monthly credit, not unlimited free compute. |
| Kilo Gateway | [Personal profile](https://app.kilo.ai/) | API key at bottom of Your Profile. Free-router models only; no confidential prompts. |
| Z.AI | [API keys](https://z.ai/manage-apikey/apikey-list) | Free Flash models only, not paid FlashX or search tools. |
| NVIDIA | [Build catalog](https://build.nvidia.com/) | Free Developer Program API for development/evaluation, not production; no confidential data. |
| Vercel AI Gateway | [Gateway dashboard](https://vercel.com/ai-gateway) | Eligible monthly free credit only. No paid balance, BYOK or top-ups. |
| OpenCode Zen | [Sign in](https://opencode.ai/auth) | Temporary free models only; no billing or auto-reload. |

There are **12 provider choices**. Windows has a scrolling key-entry form; Linux prompts for each field. See [verified free-access details and exclusions](docs/free-provider-expansion.md) for conditions, current source links, and why retired GitHub Models and Cerebras's expiring paid-card trial are excluded.

Never enter your email password, browser cookies, Claude/ChatGPT login session, or someone else's key. Consumer free-plan logins are not interchangeable with API credentials. This package does not enable billing or add credits. Free-only routing is a local model policy, **not control over your provider's billing account**: quotas and account settings must also be correct. Optional providers that fail validation stay disabled unless a working key was previously saved.

## How it works

OpenCode handles tools, files, and the conversation, using OpenRouter's free-model router as its host model. Bounded delegated work goes to OmniRoute in **regular mode**, with intent classification and same-provider model fallback before switching providers. Actual host models appear in response footers; worker replies include provider/model attribution and a route ID. Model availability can change; fallbacks do not guarantee unlimited service.

Only regular mode is configured. Native OpenCode task delegation is disabled in this launcher; the OmniRoute MCP worker tool is enabled. Calls remain model-directed, not a guarantee that every request uses a worker. If the OpenRouter host is rate-limited, the chat can stop even while optional worker providers have quota; those worker keys do not replace the OpenCode host automatically.

Four short on-demand skills help with focused implementation, debugging, review, and verification. No large always-on skill collection is included. Sharing, automatic OpenCode upgrades, and third-party plugins are disabled by the launcher. Provider requests necessarily leave your device; local encryption does not make remote inference private.

## Local files and safety (Windows paths)

- Install/data: `%LOCALAPPDATA%\OmniRouteRegular`. Keys are encrypted with Windows current-user DPAPI. The UI never reads them back or writes a plaintext import file.
- OpenCode profile/history: `opencode-user` under that folder. OpenCode may retain your prompts/code in its local history. Do not share your installed folder.
- Default working folder: `workspace` under the installation. OpenCode can act on files; review permission prompts carefully.
- Router diagnostics: `data\logs\omniroute.jsonl`. Routing metadata and redacted errors are logged; prompts and credentials are not intentionally logged by OmniRoute. Review logs before sharing.
- The router starts hidden when you launch OpenCode and is stopped when the launcher exits normally. There is no login/startup task and no always-visible background terminal. Port 47839 is reserved for this package; one instance at a time.
- No Codex/Claude integration, global PATH entry, or global OpenCode configuration is installed. This repository retains the broader OmniRoute source for testing, but the portable launcher is regular-only.
- Rerunning Setup opens Settings for an existing completed installation. It does not update binaries. To update, close OpenCode and use a separate installation folder until a migration installer is available.
- To uninstall, close OpenCode, remove the two desktop shortcuts, and delete the specific `%LOCALAPPDATA%\OmniRouteRegular` folder. This deletes its keys and chat history too. Do not delete the separate `OmniRoute` folder if you have another installation.

The ZIP is unsigned. Its SHA256 sidecar detects corruption when obtained from a trusted release; a checksum is not a publisher signature. Managed/company OpenCode policies may override user settings; use this on a personal unmanaged Windows account.

## Build and test from source

Maintainers need Node 22+, npm and tar. Windows x64 also needs PowerShell 5.1; Linux x64 needs xz, libsecret-tools and an unlocked Secret Service. Build on the target OS:

```powershell
npm ci --ignore-scripts
npm test
npm run test:regular
npm run eval
npm run package:regular
npm run test:package
```

The packaging script verifies pinned upstream runtime digests and creates `release/`. Production dependencies are installed from the lockfile; workspace junctions are dereferenced. No existing runtime directories, keys, logs, host profiles, or personal account configuration are included. Packaging tests use temporary isolated profiles and synthetic credentials, not an owner's API keys. Tests do not certify future free-model availability or simulate a completely fresh Windows VM.

MIT licensed. Bundled Node/OpenCode licenses and production-dependency notices are retained. Upstream: [OpenCode configuration](https://opencode.ai/docs/config/), [Node downloads](https://nodejs.org/en/download).
