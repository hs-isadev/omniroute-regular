# OmniRoute Dual 0.5.5

One download for Windows and Linux. It installs OmniRoute and OpenCode, then
connects OmniRoute to Codex, OpenCode, and Antigravity. No source-code checkout
or manual MCP editing is needed.

## Download

[Download the Windows + Linux setup package](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.5.5/OmniRoute-Dual-0.5.5.zip) — about 228 MB.

SHA-256: `9b1a287ce16d6e5b4810a3a20f59c65ab942276e1c3078f943aa67e57198b660` ([checksum file](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.5.5/OmniRoute-Dual-0.5.5.zip.sha256)).

## Install

1. Download and extract the ZIP. Do not run setup from inside the ZIP.
2. Windows: double-click `Install-Windows.cmd`. Linux: open the extracted
   folder in Terminal and run `sh Install-Linux.sh`.
3. Setup checks for Codex and Antigravity. If either app is missing, it guides
   you to install it. Sign in when each app opens, then confirm so setup can
   connect MCP. On Windows, Codex is the coding view inside ChatGPT desktop; on
   Linux, setup uses Codex CLI. OpenCode is bundled.
4. Enter any API keys you want in the labeled key window. Each supported
   provider has up to six slots; leave unused slots blank. Optional browser
   providers ask you to sign in yourself.

Setup configures one OmniRoute MCP server in Codex, OpenCode, and Antigravity,
then opens/reopens the apps so they load the new settings. It verifies that the
bundled OpenCode shortcut actually discovers one connected OmniRoute MCP before
calling setup complete. The OpenCode config uses the format documented by
OpenCode; if you installed an earlier OmniRoute package that wrote an invalid
nested entry, rerunning this setup migrates that OmniRoute-owned entry. Other
MCP entries are kept. Setup honors `CODEX_HOME` if your Codex uses a custom
settings folder and stops if any required host config cannot be linked.

Your API keys and account sign-ins stay on your device. Setup never reads
passwords or browser cookies. Cancelled sign-in means MCP linking does not
continue; finish sign-in and rerun setup.

## Use OmniRoute OpenCode

Open the Desktop/app-menu shortcut, or run this in a new terminal:

```text
omni harness opencode --mode regular
```

This opens the installed OpenCode with the same OmniRoute settings and saved
conversations as the shortcut.

## What is tested

The full test suite passed (169 passed, 2 platform-specific skips). Windows and
Linux were each tested by installing twice into an isolated temporary location;
both bundled OpenCode checks found one connected OmniRoute MCP and completed a
local tool round trip. Codex, OpenCode, and Antigravity config fixtures passed.
The release payload scan checked 7,672 files and found no keys, browser profiles,
or account data. The ZIP includes detailed verification notes; the signed-in
Codex and Antigravity app panels were not interactively tested on another
person's device.

Codex's coding view can use the local MCP configuration. Regular ChatGPT chats
cannot connect directly to a server running on your computer. Provider quotas
vary; free availability is not a promise of unlimited access.
