# OmniRoute — quick setup

OmniRoute connects supported coding apps to AI models from one place. The same
download works on Windows and Linux. You bring your own provider API keys and
sign in to your own accounts.

## Install it

1. [Download the latest setup ZIP](https://github.com/hs-isadev/omniroute-regular/releases/latest).
2. Extract the **whole ZIP**. Keep its files together; do not run setup from
   inside the compressed ZIP.
3. Start setup:
   - **Windows:** double-click `Install-Windows.cmd`.
   - **Linux:** open a terminal in the extracted folder and run
     `sh ./Install-Linux.sh`.
4. Follow the prompts. In the **API Keys** window, click **Get key** beside a
   provider, enter your own key, then click **Save and test**. The window tells
   you which providers connected.
5. Sign in yourself when an app or the optional separate browser opens. Restart
   any coding app that was already open.

When you run a newer setup in the same install folder, it keeps the new version
and one older version so you can roll back. It removes older intact OmniRoute
runtime copies, but preserves your API keys and settings. If a folder contains
extra or changed files, setup leaves it alone to protect your data.

To open OmniRoute's regular OpenCode harness from a terminal, run:
`omni harness opencode --mode regular`.

To add more keys later, click **OmniRoute API Keys** on the Windows Desktop
or in the Start Menu. On Linux, find **OmniRoute API Keys** in your applications
menu.

Each provider can use up to five API keys. If you paste a new key into a slot
that is already filled, OmniRoute keeps the saved key and moves the new key to
the next available slot. Exact duplicate keys are skipped, and the save message
identifies the slot used. Requests rotate across available keys for that provider;
invalid-key authentication failures can move to another saved key. A quota or
rate-limit response cools the whole provider's keys and models; OmniRoute then
uses another eligible provider if available. It does not rotate keys or models
to get around provider limits.

## What setup does

- Installs OmniRoute and OpenCode, and sets up Antigravity.
- Connects Codex and Claude Code if they are already installed. It does not
  install or sign you in to those apps.
- Installs 11 coding helper skills for Codex, OpenCode, and Antigravity.
- If you use the optional browser providers, keeps their sign-in in a separate
  local browser profile. After setup, that browser is set to start minimized
  when you sign in to your computer.

## Good to know

Use Windows 10/11 or Linux on an x64 computer with internet access. Your device
may ask you to approve downloads or security prompts. Free provider access has
limits and can change; setup cannot guarantee every provider will be available.
Never enter account passwords or browser cookies in the API key window.

The release also has an optional `code.zip` for developers. You do **not** need
it to install OmniRoute.
