# Codex integration

Codex CLI, the Codex IDE extension, and the ChatGPT desktop Codex surface share
the documented `~/.codex/config.toml` MCP layer. OmniRoute installs a supported
stdio `mcp_servers.omniroute` entry with absolute Node and CLI paths. The MCP
server's initialization instructions keep the first 512 characters
self-contained, tell Codex when routing helps, and require attribution
preservation.

For Codex specifically, the integration also:

- structurally validates existing TOML before editing;
- merges a supported user-level `~/.codex/hooks.json` `UserPromptSubmit` hook;
- appends a delimited, removable section to `~/.codex/AGENTS.md` without
  replacing existing global instructions;
- uses absolute paths and a five-second deterministic hook;
- leaves normal hook trust review enabled.

```powershell
omni integrate codex --user --dry-run
omni integrate codex --user --apply
omni integrate doctor
```

In Codex, use `/mcp` to inspect the server and `/hooks` to review and trust the
new hook. OmniRoute never uses `--dangerously-bypass-hook-trust`. Hooks provide
routing context; they do not make every prompt an OmniRoute request.

Current official references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp),
[hooks](https://learn.chatgpt.com/docs/hooks), and
[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
