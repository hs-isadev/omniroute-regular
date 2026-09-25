# OmniRoute setup

## Latest download

[Download OmniRoute Dual 0.5.3 for Windows and Linux](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.5.3/OmniRoute-Dual-0.5.3.zip) — about 228 MB.

SHA-256: `f34cd7e9a4c5829851cef98de03e2968767f6528468e79ad5d5090f3ced5b366` ([checksum file](OmniRoute-Dual-0.5.3.zip.sha256)).

The ZIP includes both installers, OmniRoute, OpenCode, and the skill bundle. It does not contain API keys or account sign-ins.

## Install

1. Download and extract the ZIP. Do not run setup from inside the ZIP.
2. Windows: double-click `Install-Windows.cmd`. Linux: open the extracted
   folder in Terminal and run `sh Install-Linux.sh`.
3. Setup checks for Codex and Antigravity, opens each sign-in flow, and waits
   for you to confirm before it links MCP. If an app is missing, it opens the
   official install page or installs Google's Antigravity app. On Windows,
   Codex is the coding view inside ChatGPT desktop. On Linux, setup uses Codex
   CLI and its official sign-in flow.
4. OpenCode is bundled and connected automatically; you do not need to download
   or sign in to OpenCode separately. Enter any API keys you want in the labeled
   key window. There are six slots per supported provider; leave unused slots
   blank. Optional browser providers ask you to sign in yourself.

Setup never reads account passwords or cookies. If you cancel a sign-in step,
it stops before MCP wiring; install/sign in and run setup again.

## Use OmniRoute OpenCode

Open the Desktop/app-menu shortcut, or run this in a new terminal:

```text
omni harness opencode --mode regular
```

This opens the installed OpenCode using the same OmniRoute connection, settings,
and saved conversations as the shortcut.

## ChatGPT note

Codex's coding view can use the local MCP configuration. Regular ChatGPT chats
cannot directly connect to a local MCP server, so setup does not wire OmniRoute
into classic ChatGPT chat. OpenAI documents that ChatGPT MCP apps connect to
remote servers, not directly to a server running on your computer. [Read
OpenAI's MCP help page](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps).

## Testing note

The Windows package install and local OpenCode tool test passed. Linux package
files and checksums are verified, but a Linux installation was not run on the
build machine. See `VERIFICATION.md` inside the download.

Provider quotas vary. Browser-based services are for small tasks, not unlimited
API use. Paid fallback is off.
