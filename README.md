# OmniRoute Dual 0.5.4

One download for Windows and Linux. It installs OmniRoute and OpenCode, then
connects OmniRoute to Codex, OpenCode, and Antigravity. No source-code checkout
or manual MCP editing is needed.

## Download

[Download the Windows + Linux setup package](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.5.4/OmniRoute-Dual-0.5.4.zip) — about 228 MB.

SHA-256: `30806ecdebe30898daeef12b6fa4a7a759ebc453c953057ee2c112c1716c7ff2` ([checksum file](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.5.4/OmniRoute-Dual-0.5.4.zip.sha256)).

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

Setup configures Codex, OpenCode, and Antigravity MCP automatically and installs
the included OmniRoute skills. It honors `CODEX_HOME` if your Codex uses a
custom settings folder. If Codex MCP cannot be linked, setup reports an error
instead of claiming success. Restart Codex after setup if it was already open.

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

The full test suite passed (168 passed, 2 skipped). Windows setup was tested
twice in a fresh temporary install; its local OpenCode/MCP tool call passed.
Both platform package manifests verified. Linux installation was not tested on
the build computer because Windows denied WSL access. The ZIP includes detailed
verification notes.

Codex's coding view can use the local MCP configuration. Regular ChatGPT chats
cannot connect directly to a server running on your computer. Provider quotas
vary; free availability is not a promise of unlimited access.
