# Z.AI GLM consumer provider

OmniRoute can use the separate `zai-consumer-adapter` MCP server as a local,
credential-free worker. The adapter attaches to an already signed-in dedicated
browser profile over loopback CDP. OmniRoute does not read, export, or package
the profile's cookies or Z.AI credentials.

Portable defaults keep `zai-consumer` disabled because its Node executable and
adapter paths are installation-specific. One-click setup enables it locally,
points it at `http://127.0.0.1:47843`, and creates a per-user background
autostart entry. Claude uses a different profile and port.

The configured model is `glm-web-consumer`. It claims text and coding only,
does not claim tools, web, vision, or structured output, and is capped at the
`small` task class. Z.AI receives only the natural user prompt. The adapter
extracts the final assistant answer while excluding the UI's thinking-chain
container.

Keep the dedicated profile signed in. Z.AI account quotas and terms still
apply; this integration does not create API access, copy authentication into
OmniRoute, or bypass upstream limits. If the browser or page UI is unavailable,
OmniRoute marks the failure retryable and continues through the eligible
free-provider ladder.
