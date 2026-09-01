# OmniRoute — OpenCode + Antigravity

One download for Windows 10/11 x64 and Linux x64 desktops. No Codex subscription
needed. No API keys, accounts, vaults or personal projects are included.

## Start here

1. Extract the entire ZIP.
2. **Windows:** double-click **Install-Windows.cmd**.
   **Linux:** open a terminal in the extracted folder and run **sh Install-Linux.sh**.
3. In the **API Keys** window, click **Get key**, get your own provider key, and
   paste it beside that provider. Tick the free-account confirmation and click
   **Save and test**. Leave other fields blank. One working provider is enough.
4. Sign in to Antigravity when its official app opens after key setup.

No editing config files, copying commands between apps, or manual MCP setup.
Setup installs bundled Node/OpenCode/OmniRoute, obtains official Antigravity,
connects MCP and creates launchers. OS security/admin/keyring prompts can still
require approval. Antigravity may show its own first-run onboarding.

## After setup

- **OmniRoute OpenCode:** OmniRoute is the main model. Small questions prefer
  lightweight workers; coding/complex requests prefer stronger eligible workers.
  Same-provider free fallbacks are tried before moving to another provider.
- **OmniRoute Antigravity:** Antigravity's own model is the main agent; OmniRoute
  provides MCP workers. Rules encourage delegation but cannot guarantee every
  host call uses a worker. Antigravity's own account/model quota still applies.
- **OmniRoute API Keys:** open the same masked form to add or replace keys later.

Windows launchers appear on the Desktop; Linux launchers appear in the app menu.
Restart a host after changing keys. Neither host is registered for autostart.
OpenCode starts in a starter workspace; open your project from there or pass a
project path to the installed launcher (`Launch.ps1 -Action opencode C:\Projects\Example`
or `sh Launch.sh opencode /path/to/project`). Normal tool approval prompts remain.

## Your own keys, free models only

Slots: Groq, Cerebras, SambaNova, Gemini, Cohere, Cloudflare, Mistral,
OpenRouter, Kilo, Z.AI Flash, NVIDIA evaluation and OpenCode Zen free models.
Cloudflare needs both an API token and account ID. Each slot has its acquisition
link. You bring your own provider keys to OmniRoute; this does not enable paid
gateway BYOK fallbacks. Cerebras and SambaNova are initially text/coding workers;
tool-call promotion requires a successful live compatibility check.

Blank fields keep keys already saved in this profile. Nothing is copied from
someone else's profile or machine. Windows uses its user-bound encrypted vault;
Linux uses an encrypted vault protected by the desktop Secret Service keyring.
The graphical form does not create a plaintext key-entry file. Do not paste
passwords, cookies, Antigravity sessions or subscription logins into API fields.
Clipboard history and existing files from older Notepad workflows are not erased.

Use only free/evaluation accounts, with paid overages and auto top-up disabled.
Free access has quotas and terms; it is not unlimited and can change. Some free
providers retain prompts or restrict evaluation/commercial/confidential usage.
Do not send private repository secrets to hosted workers. No billing settings
are changed by setup. HF/Vercel credit-based inference and LongCat's paid API
are excluded. The provider list is not a promise that every model is available.

## Failed provider? You can still finish

Valid keys are saved even when another provider fails. The form reports failed
provider names; failed new keys are not activated and existing saved keys remain.
If none work, the form stays open so you can retry or use another free provider.

Latest owner-account checks: Groq, Gemini, Mistral, Cohere, Cloudflare, OpenRouter,
Kilo and OpenCode Zen have passed inference. Kilo's Auto Free returned 503 but
its free fallback worked. Z.AI returned 429 / a timeout; it remains an available
slot for your own account. NVIDIA, Cerebras and SambaNova are untested with a
live owner key. Their adapters have mock-backed protocol tests only. These
results are not guarantees for another account or proof of large-project coding
quality.

## Platform requirements and verification

Internet is needed for Antigravity download, login and API tests. Bundled Node
and OpenCode are pinned. Antigravity downloads directly from Google and is hash
checked (also Google-signed on Windows); its binaries are not redistributed.
Git for Windows is installed with Winget if absent. Linux needs a graphical
session and unlocked Secret Service keyring. Debian/Ubuntu and Fedora setup
can install Git, Python Tk, xdg-utils and keyring helpers with your OS approval.
Other Linux distributions may need those packages installed manually. ARM,
headless servers and Alpine/musl are not supported by this x64 desktop bundle.

OpenCode routing is text/code only; image/audio input is rejected. Responses
are buffered to allow fallback before tool calls are delivered. This is a
coding harness, not an isolation sandbox. See **VERIFICATION.md** for checks
actually run. The package is unsigned; hashes and scans do not guarantee the
absence of every security defect. This ZIP can be shared locally; no GitHub
upload is performed by setup.
