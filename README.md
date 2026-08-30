# OmniRoute Regular for Windows

OpenCode coding/chat harness + OmniRoute free-provider workers. No Codex or Claude subscription required. Bring your own API keys; no credentials are distributed.

## Install (Windows 10/11, x64)

1. Download the **OmniRoute-Regular-0.1.0-windows-x64.zip** release asset (not GitHub's "Source code" ZIP).
2. Right-click the ZIP, choose **Extract All**, open the extracted folder, and double-click **Setup.cmd**. No administrator account, Node installation, or terminal commands are required. Windows may show an unsigned-download warning; inspect the source and checksum before deciding whether to run it.
3. In the local masked form, paste **your own OpenRouter API key**. Add any optional provider keys below. Confirm your accounts have no paid overages/auto top-up, then click **Validate and save**. Validation makes one small API request per supplied provider, consuming free quota. It can take a few minutes.
4. Open **OmniRoute Regular** on the desktop. Use **OmniRoute Regular Settings** to add/change keys later. Blank fields keep saved keys; failed replacement keys do not overwrite working ones.

Setup bundles Node.js 22.23.2 and OpenCode 1.18.25. An internet connection is required to validate keys and use the models. Provider account creation, region/age eligibility checks, and accepting provider terms cannot be automated for you.

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

Never enter your email password, browser cookies, Claude/ChatGPT login session, or someone else's key. Consumer free-plan logins are not interchangeable with API credentials. This package does not enable billing or add credits. Free-only routing is a local model policy, **not control over your provider's billing account**: quotas and account settings must also be correct. Optional providers that fail validation stay disabled unless a working key was previously saved.

## How it works

OpenCode handles tools, files, and the conversation, using OpenRouter's free-model router as its host model. Bounded delegated work goes to OmniRoute in **regular mode**, with intent classification and same-provider model fallback before switching providers. Actual host models appear in response footers; worker replies include provider/model attribution and a route ID. Model availability can change; fallbacks do not guarantee unlimited service.

Only regular mode is configured. Native OpenCode task delegation is disabled in this launcher; the OmniRoute MCP worker tool is enabled. Calls remain model-directed, not a guarantee that every request uses a worker. If the OpenRouter host is rate-limited, the chat can stop even while optional worker providers have quota; those worker keys do not replace the OpenCode host automatically.

Four short on-demand skills help with focused implementation, debugging, review, and verification. No large always-on skill collection is included. Sharing, automatic OpenCode upgrades, and third-party plugins are disabled by the launcher. Provider requests necessarily leave your device; local encryption does not make remote inference private.

## Local files and safety

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

Windows x64, Node 22+, npm, built-in PowerShell 5.1 and tar are required for maintainers only:

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
