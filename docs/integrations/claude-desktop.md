# Claude Desktop integration

Claude Desktop's supported local extension path is an MCP Bundle (`.mcpb`, the
current name for DXT). OmniRoute includes a manifest-version 0.4 Node extension
definition under `packages/integrations/claude-desktop` and packages the same
MCP adapter used by Codex and Claude Code. `npm run build` validates the manifest
with Anthropic's MCPB tool and creates:

```text
artifacts\omniroute-0.1.0.mcpb
```

Install the generated bundle through Claude Desktop:

1. Open **Settings > Extensions**.
2. Open **Advanced settings > Extension Developer**.
3. Choose **Install Extension…** and select
   `artifacts\omniroute-0.1.0.mcpb`.
4. Restart Claude Desktop if requested, then verify the three OmniRoute tools.

Removal is performed through the same Extensions UI. OmniRoute does not edit
undocumented Claude Desktop files.

An installed MCPB makes tools available; it does not intercept every prompt or
guarantee automatic invocation. Server instructions encourage appropriate use,
but standalone `omni chat` is the profile that guarantees routing on every turn.

Current official reference: [local MCP servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).
