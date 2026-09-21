# OpenCode regular-mode integration

OpenCode is OmniRoute's recommended regular harness. The managed integration:

- preserves unrelated OpenCode settings, instructions, and MCP servers;
- adds a local `omniroute` MCP server restricted to `regular` mode;
- keeps the OpenRouter-shaped `openrouter/openrouter/free` alias for OpenCode
  compatibility, but points its transport at the local OmniRoute daemon;
- gives OpenCode only the daemon's local bearer token. OmniRoute owns provider
  selection and free-model failover, so an OpenRouter limit can move the
  request to Gemini, Groq, or another eligible provider; and
- starts OpenCode with `--pure` so external plugins are disabled; and
- rejects orchestrator and subscription flags.

Install and apply it on Windows:

```powershell
npm install -g opencode-ai
omni integrate opencode --user --dry-run
omni integrate opencode --user --apply
omni integrate doctor
omni harness opencode --mode regular
```

The persistent files are `%USERPROFILE%\.config\opencode\opencode.json` and
`%USERPROFILE%\.config\opencode\omniroute-regular.md`. Existing files are
backed up before a managed change. Remove only OmniRoute's managed entries with:

```powershell
omni integrate remove opencode --user --apply
```

Always use `omni harness opencode --mode regular` when OmniRoute routing
matters. Running `opencode` directly loads normal OpenCode configuration and is
outside OmniRoute's wrapper. Free services remain quota-limited and can be
temporarily unavailable; the daemon tries the configured eligible ladder but
cannot guarantee capacity.

OpenCode is still a local coding agent, not a security sandbox. It can run
commands and read files in the selected workspace, and its process receives
only the local daemon token. Provider credentials remain in OmniRoute's vault;
run the wrapper only in repositories you trust and never open an unknown
repository with it.
