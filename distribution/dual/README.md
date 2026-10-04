# OmniRoute 0.6.8 — browser consumers off, old runtimes cleaned up

This update verifies the installed MCP runtime before host registration, repairs
registrations after updates, isolates provider health deadlines, and
adds content-free live provider diagnostics.
See ROUTING-POLICY.md for diagnostics/pins and HOST-ORCHESTRATION.md for bounded
worker context budgets. API availability still determines eligibility. Browser-
consumer providers are disabled in this package and never receive routed tasks.

One download for Windows 10/11 x64 and Linux x64 desktops. No Codex subscription
needed. No API keys, accounts, vaults or personal projects are included.

## Start here

1. Extract the entire ZIP.
2. **Windows:** double-click **Install-Windows.cmd**.
   **Linux:** open a terminal in the extracted folder and run **sh Install-Linux.sh**.
3. In the **API Keys** window, click **Get key**, get your own provider key, and
   paste it beside that provider. Tick the free-account confirmation and click
   **Save and test**. Configure any supported providers; blank fields keep saved keys.
4. Sign in to Antigravity when its official app opens. On Windows
   x64, the package also verifies and opens the official Devin CLI login when it
   is available. Existing
   Codex and Claude Code installations are connected automatically; the package
   does not install or sign into those optional hosts.

No editing config files, copying commands between apps, or manual MCP setup.
Setup installs bundled Node/OpenCode/OmniRoute, obtains official Antigravity,
connects MCP and creates launchers. It optionally downloads the official signed
Devin CLI updater on Windows x64, validates its exact SHA-256 and publisher before
running it, and configures only a local OmniRoute MCP—never a Devin API key or
model selection. OS security/admin/keyring prompts can still
require approval. Antigravity may show its own first-run onboarding.

Setup also installs eleven compact, reusable skills in Codex, OpenCode and
Antigravity: focused implementation, focused code review, root-cause debugging,
verify change, TDD workflow, coding standards, search first, security review,
context budget, OmniRoute-first delegation, and GitHub package release. It adds persistent
OmniRoute-first guidance to Codex and OpenCode; Antigravity already receives its
global OmniRoute rules during setup.

Existing same-named skills are left untouched. Restart an app that was already
open during setup to refresh its skill list.

## After setup

- **Open the regular harness:** in a terminal, run
  `omni harness opencode --mode regular`. If you run it from the install folder,
  `Launch.cmd harness opencode --mode regular` (Windows) and
  `./Launch.sh harness opencode --mode regular` (Linux) use the bundled CLI.
- **Update cleanup:** after a new version installs successfully, OmniRoute keeps
  only that active runtime and removes every older verified OmniRoute runtime
  copy. This saves disk space, but a previous-version rollback is not available.
  Your API keys, settings and other user data stay in place. If an old runtime
  folder contains extra or changed files, setup leaves it alone rather than risk
  deleting your files.

- **OmniRoute OpenCode:** OmniRoute is the main model. It chooses the strongest
  eligible configured model for the request, using free status, health, task
  class, capabilities, context, and configured model tiers. Those tiers are
  routing hints, not a universal model-quality benchmark.
  Complex coding and high-risk requests can use two or three substantive API
  workers in parallel, capped by `maxParallelWorkers`, followed by one final
  synthesis. Same-provider model fallbacks are allowed for non-quota errors;
  quota errors cool the whole provider and fall back to another provider.
- **OmniRoute Antigravity, Codex, and Claude Code:** each host's own model is the
  main agent; OmniRoute provides MCP workers. Rules encourage delegation but
  cannot guarantee every host call uses a worker. Each host's own quota applies.
- **Add keys later:** click **OmniRoute API Keys** on the Windows Desktop or in
  the Start Menu. On Linux, open your applications menu and choose **OmniRoute
  API Keys**. Both shortcuts open the masked key form with five slots per provider.
  Add provider keys without rerunning setup; filled slots are never overwritten,
  duplicate keys are skipped, and a new key moves to the next free slot. The
  message shows where it was saved. Routing settings and other saved keys are
  preserved. Normal requests use the saved key pool; an invalid-key
  authentication failure may try another saved key. A provider quota/rate limit
  cools all of that provider's models and keys, then routes to another eligible
  provider if one is available. It will not rotate same-provider keys or models
  to work around a limit. OmniRoute restarts after an accepted key change.
- **OmniRoute Usage:** shows exact provider-reported worker tokens offloaded.
  Actual host tokens saved stays unavailable because a counterfactual host-only
  run cannot be observed.
- **OmniRoute Devin CLI:** opens the user-controlled official Devin login after
  the package verifies its publisher. Its local `omniroute_regular` MCP has only
  the normal free-only router context. It does not enable paid Devin Fusion,
  import Antigravity models, or choose Astra/Sol/Terra models; those choices are
  controlled by the Devin/host account and may be unavailable.

Windows launchers appear on the Desktop; Linux launchers appear in the app menu.
Restart a host after changing keys. Developer hosts are not registered for
autostart. Browser-consumer providers are disabled and are not used for routing.
On upgrade, setup removes only recognized OmniRoute browser-consumer startup
entries; it leaves browser profiles and sign-in data untouched, and preserves
unrelated startup entries. Any already-open browser window is left alone and can
be closed normally.
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
Browser consumers are disabled in this package; only configured API providers are
eligible. Swarm fan-out uses healthy eligible API workers only and is skipped for casual/light work or when the original input,
bounded worker drafts, and requested final output would exceed the synthesis
model's context window. Groq can participate when healthy, but provider rotation
and failover may select other configured free providers. Every parallel worker
outcome and the final synthesis worker are recorded in route attribution.

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
