# OmniRoute setup

OmniRoute is a Windows/Linux desktop setup that connects coding assistants to
OmniRoute and its eligible AI providers. Setup handles the software and MCP
wiring; you provide your own API keys and sign in to your own accounts.

## Download

Get the newest installer from the [GitHub Releases page](https://github.com/hs-isadev/omniroute-regular/releases/latest).
Download the combined Windows/Linux ZIP, extract the whole folder, and keep the
SHA-256 file beside it so you can verify the download. The release will also
offer an optional source archive named **code.zip**; it is not needed to install.

## Set it up

1. Extract the installer ZIP.
2. On Windows, double-click **Install-Windows.cmd**. On Linux, open a terminal
   in the extracted folder and run **sh Install-Linux.sh**.
3. In the API Keys window, add the provider keys you want to use, confirm that
   you are using free/evaluation access, and choose **Save and test**.
4. Sign in when the dedicated browser or an AI app opens. OmniRoute cannot sign
   in for you or copy accounts from your usual browser.
5. Restart an app that was already open during setup.

Some operating-system security, administrator, keyring, download, or first-run
prompts still need your approval. Codex and Claude Code are connected only when
already installed; the installer does not sign you in to those apps.

## What is included

- One installer for Windows 10/11 x64 and Linux x64 desktops.
- OmniRoute, OpenCode, and automatic MCP setup for Antigravity. Existing Codex
  and Claude Code installations are connected when supported.
- A dedicated local browser profile for the optional signed-in web consumers.
  It opens for setup/sign-in and is configured to start minimized at later
  device logins.
- Eleven practical skills installed globally for Codex, OpenCode, and
  Antigravity: focused implementation, code review, root-cause debugging,
  change verification, TDD workflow, coding standards, search first, security
  review, context budget, OmniRoute-first delegation, and GitHub package release.

The installer contains no API keys, passwords, browser cookies, account
sessions, or personal projects. Provider quotas, availability, and terms apply;
free access is not unlimited. Read **VERIFICATION.md** in the downloaded ZIP for
what was tested and what was not.

## Source code

The GitHub release provides the source separately in **code.zip**. It contains
the source snapshot used for the package, not credentials or installed account
data. You do not need it to set up OmniRoute.
