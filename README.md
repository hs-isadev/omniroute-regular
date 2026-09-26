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
