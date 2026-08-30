# OpenCode regular-mode integration

OpenCode is OmniRoute's recommended regular harness. The managed integration:

- preserves unrelated OpenCode settings, instructions, and MCP servers;
- adds a local `omniroute` MCP server restricted to `regular` mode;
- pins the wrapper's host and small model to `openrouter/openrouter/free`,
  allowlists only OpenRouter, hides every other OpenRouter model, and disables
  provider fallback for that free-router entry;
- gives OpenCode only the selected OpenRouter key, never the vault master key,
  daemon bearer token, or unrelated provider/cloud credentials; and
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

Always use `omni harness opencode --mode regular` when the free regular pin
matters. Running `opencode` directly loads normal OpenCode configuration and is
outside OmniRoute's wrapper. Free services remain quota-limited and can be
temporarily unavailable; the pin prevents a paid fallback but cannot guarantee
capacity.

OpenCode is still a local coding agent, not a security sandbox. It can run
commands and read files in the selected workspace, and its process receives the
dedicated OpenRouter key needed for the host call. Run the wrapper only in
repositories you trust, use a dedicated OpenRouter key/account with no paid
balance or automatic top-up, and never open an unknown repository with it.
