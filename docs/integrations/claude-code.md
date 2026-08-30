# Claude Code integration

Claude Code user-scoped MCP servers live in `~/.claude.json`; user hooks live in
`~/.claude/settings.json`. OmniRoute structurally merges:

- `mcpServers.omniroute` as a stdio server with absolute executable paths and an
  ownership marker; and
- a fast `UserPromptSubmit` hook that adds routing context.

Unrelated MCP servers, hooks, preferences, and settings are preserved.

```powershell
omni integrate claude-code --user --dry-run
omni integrate claude-code --user --apply
omni integrate doctor
```

Use `/mcp` and `/hooks` in Claude Code to verify. If current hook input does not
provide authoritative active-model metadata, OmniRoute records the host model
as unknown. The hook does not intercept or rewrite the prompt; it advises the
host when the supported MCP tool is appropriate.

## Harness modes

```powershell
omni harness claude --mode regular
omni harness claude --mode orchestrator
```

These launch Claude Code with an OpenRouter-compatible Anthropic endpoint and
the encrypted `OPENROUTER_API_KEY`; no key is written to Claude settings or
printed. The free router can vary models and has strict quotas, so this is a
best-effort development path rather than a reliability promise.

After a Claude subscription is active:

```powershell
omni harness claude --mode orchestrator --subscription
```

This removes API/gateway/cloud overrides from the child environment and asks
Claude Code to use `claude-opus-5`. Claude Code owns authentication. The Opus
host synthesizes and verifies; OmniRoute MCP delegation remains free-only.

Current official references: [Claude Code MCP](https://code.claude.com/docs/en/mcp)
and [hooks](https://code.claude.com/docs/en/hooks).
