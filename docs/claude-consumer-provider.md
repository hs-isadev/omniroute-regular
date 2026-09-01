# Claude consumer provider

OmniRoute can use the separate `claude-consumer-adapter` MCP server as a local,
credential-free worker. The adapter attaches to an already signed-in Opera GX
profile over loopback CDP; OmniRoute never reads, copies, or stores the browser's
cookies or Claude credentials.

The provider is disabled in distributable defaults because its executable path
is machine-specific. A local installation enables `claude-consumer`, sets
`mcpCommand` to Node, and sets `mcpArgs` to the adapter's `dist/bin.js` followed
by `mcp`. Process creation uses an argument array with `shell: false`; only a
small allowlist of ordinary OS environment variables plus
`CLAUDE_CDP_ENDPOINT` reaches the adapter child process.

The configured model is `claude-web-consumer`. It claims text and coding only,
does not claim tools, web, vision, or structured output, and is capped at the
`small` task class. Put `claude-consumer` first in
`routing.directProviderOrder` to prefer it for eligible micro/small requests.
Medium, large, and critical work is removed from this provider before routing.
If the browser session is unavailable, OmniRoute classifies that as a retryable
provider outage and continues through the existing free-provider ladder.

Keep the dedicated Opera GX profile running and signed in. Consumer-account
usage is still subject to Claude's terms and account limits; this integration
does not create API access or bypass upstream limits.
