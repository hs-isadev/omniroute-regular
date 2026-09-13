# OmniRoute Private 0.6.5 — verified providers and host runtime

This update verifies the installed MCP runtime before host registration, repairs
registrations after update or rollback, isolates provider health deadlines, and
adds content-free live provider diagnostics.
See ROUTING-POLICY.md for diagnostics/pins and HOST-ORCHESTRATION.md for bounded
worker context budgets. API and browser availability still determine eligibility.

One download for Windows 10/11 x64 and Linux x64 desktops. No Codex subscription
needed. No API keys, accounts, vaults or personal projects are included.

## Start here

1. Extract the entire ZIP.
2. **Windows:** double-click **Install-Windows.cmd**.
   **Linux:** open a terminal in the extracted folder and run **sh Install-Linux.sh**.
3. In the **API Keys** window, click **Get key**, get your own provider key, and
   paste it beside that provider. Tick the free-account confirmation and click
   **Save and test**. Configure any supported providers; blank fields keep saved keys.
4. One dedicated Chromium-family window opens with six tabs: Claude, Z.AI, Qwen,
   Kimi, DeepSeek, and Perplexity. Sign in manually to any service you want to use.
   The window minimizes after all six tabs are ready and starts minimized at future
   OS logins. Then sign in to Antigravity when its official app opens. Existing
   Codex and Claude Code installations are connected automatically; the package
   does not install or sign into those optional hosts.

No editing config files, copying commands between apps, or manual MCP setup.
Setup installs bundled Node/OpenCode/OmniRoute, obtains official Antigravity,
connects MCP and creates launchers. OS security/admin/keyring prompts can still
require approval. Antigravity may show its own first-run onboarding.

## After setup

- **OmniRoute OpenCode:** OmniRoute is the main model. Small questions prefer
  lightweight workers; coding/complex requests prefer stronger eligible workers.
  Complex coding and high-risk requests can use two or three substantive API
  workers in parallel, capped by `maxParallelWorkers`, followed by one final
  synthesis. Same-provider free fallbacks are tried before moving to another provider.
- **OmniRoute Antigravity, Codex, and Claude Code:** each host's own model is the
  main agent; OmniRoute provides MCP workers. Rules encourage delegation but
  cannot guarantee every host call uses a worker. Each host's own quota applies.
- **OmniRoute API Keys:** open the same masked form to add or replace keys later.
- **OmniRoute Usage:** shows exact provider-reported worker tokens offloaded.
  Actual host tokens saved stays unavailable because a counterfactual host-only
  run cannot be observed.

Windows launchers appear on the Desktop; Linux launchers appear in the app menu.
Restart a host after changing keys. Developer hosts are not registered for
autostart. One shared consumer browser starts minimized in the background at user
login. It uses the persistent profile `browser-consumer-profile`, the loopback-only
endpoint `127.0.0.1:47842`, and six provider tabs; it does not reuse the user's
normal browser profile. Chrome, Edge, Opera, Opera GX, Brave, Vivaldi and Chromium
are detected on Windows and Linux (Opera GX itself is Windows-only). Override
detection with `OMNIROUTE_BROWSER`. Firefox and Safari do not expose the Chromium
CDP transport this adapter requires.
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
The six web consumers are not BYOK: they use the accounts you explicitly sign into
and are limited by OmniRoute to small text/coding requests. Provider quotas and
terms still apply. Browser credentials remain only in the one dedicated local
profile created after installation and are never included in the package. Setup
does not copy or merge cookies, login databases, passwords, OAuth tokens, local
storage, or any other authentication material from another profile.

Browser consumers remain single-call routes. Swarm fan-out uses healthy eligible
API workers only and is skipped for casual/light work or when the original input,
bounded worker drafts, and requested final output would exceed the synthesis
model's context window. Groq can participate when healthy, but provider rotation
and failover may select other configured free providers. Every parallel worker
outcome and the final synthesis worker are recorded in route attribution.

Each browser consumer exposes `none` and `high` reasoning, and normal browser-consumer
routing defaults to `high`. The adapter activates the site's visible Thinking, Extended Thinking,
DeepThink, or Reasoning control before it submits the prompt. Availability depends
on the signed-in account and selected web model; if the control is unavailable,
the adapter reports a retryable failure and routing continues to the next provider.
Before inserting a browser prompt, each adapter focuses the input and waits 150 ms.
This small deterministic UI-settle delay is not represented as stealth or bot-evasion.
Browser-consumer requests are serialized, spaced by at least 20 seconds plus up
to 5 seconds of jitter, and limited to 30 starts per hour per adapter process.
Rate-limit, verification, unusual-traffic, and access-block notices stop automated
submission and open an escalating cooldown. These safeguards reduce burst risk;
they cannot guarantee service permission or prevent an account restriction.

## Failed provider? You can still finish

Valid keys are saved even when another provider fails. The form reports failed
provider names; failed new keys are not activated and existing saved keys remain.
If none work, the form stays open so you can retry or use another free provider.

The 2026-09-13 owner-account check used only the fixed synthetic prompt documented
in VERIFICATION.md. Kilo Auto Free succeeded. Z.AI's first Flash model returned 429
and its second configured Flash model succeeded. All three configured OpenCode Zen
free IDs returned HTTP 400 and remain unhealthy. Mistral was disabled and had no
stored credential, so it was not tested; no historical result is treated as current.
If Z.AI reports that GLM is
in peak hour, the adapter first looks for the visible **Switch to GLM 5.3 Flash**
action by its text. If it cannot select that action safely, the route fails as
retryable so OmniRoute continues down the free-provider ladder. Other disabled or
unconfigured API providers were not probed. Their adapters have mock-backed protocol tests only. These
results are not guarantees for another account or proof of large-project coding
quality. See MODEL-LIMITS.md for documented, observed, and unknown limits and
large-task recommendations.

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
absence of every security defect. Codex/Claude integration preserves unrelated
configuration and refuses unmanaged OmniRoute conflicts. This ZIP can be shared locally; no GitHub
upload is performed by setup.
