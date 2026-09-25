# OmniRoute setup for Windows and Linux

## Download

Download the latest setup package: [OmniRoute Dual 0.5.2 for Windows and
Linux](https://github.com/hs-isadev/omniroute-regular/releases/download/v0.5.2/OmniRoute-Dual-0.5.2.zip)
(about 217 MB).

SHA-256: `78ec8a1f945032bea5556bceaa58176c01049cf313147967cd5fc5c4c2e42214` ([checksum file](OmniRoute-Dual-0.5.2.zip.sha256)).

The ZIP contains both installers, OmniRoute, bundled OpenCode, and the skill files. Your API keys, passwords, and account sign-ins are not included.

## Install

1. Download and extract the ZIP. Do not run setup from inside the ZIP.
2. Windows: double-click `Install-Windows.cmd`. Linux: open the extracted
   folder in Terminal and run `sh Install-Linux.sh`.
3. Follow the numbered prompts. Setup connects supported existing Codex,
   OpenCode, and Antigravity installs. If ChatGPT or Antigravity is missing, it
   can open the official install page; you install and sign in yourself.
4. Enter any API keys you want to use in the labeled key window. There are six
   slots per supported provider; unused slots can stay blank. Optional
   browser-based providers require you to sign in yourself.

Setup keeps existing settings and keys on your computer. It does not upload them. The installer is one-click to start, with sign-in, API-key entry, and operating-system permission prompts where needed.

## Open OmniRoute OpenCode

Use the Desktop/app-menu shortcut, or open a new terminal and run:

```text
omni harness opencode --mode regular
```

This opens the installed OpenCode connected to OmniRoute, using the same settings and saved conversations as its shortcut.

## Important ChatGPT note

The setup can check for the ChatGPT desktop app and open its official download page if it is missing. ChatGPT's regular chats cannot connect directly to an MCP server running on your computer, so this installer does not claim to wire local OmniRoute MCP into ChatGPT. See [OpenAI's MCP help page](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps).

Free quotas and provider availability vary. Browser sign-in services are for small tasks, not unlimited API use. Paid fallback is off.
