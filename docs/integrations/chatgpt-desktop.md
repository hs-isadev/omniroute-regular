# ChatGPT desktop integration

The ChatGPT desktop app shares Codex MCP configuration with Codex CLI and the
IDE extension. `omni integrate chatgpt-desktop --user --apply` therefore manages
the same supported `~/.codex/config.toml` server entry and does not patch or
scrape the application.

```powershell
omni integrate chatgpt-desktop --user --dry-run
omni integrate chatgpt-desktop --user --apply
```

An MCP server being configured means OmniRoute is available to supported Codex
surfaces. It does not establish that every ordinary Chat prompt is intercepted,
that a particular proprietary host model is active, or that tool output cannot
be rephrased by the host. Use standalone `omni chat` when every request must
provably pass through OmniRoute.

See the current official [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).
