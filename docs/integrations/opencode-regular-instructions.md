# OmniRoute regular-mode instructions for OpenCode

OmniRoute regular mode is active. For every substantive user request that needs
model reasoning or generated output, call the `omniroute` MCP server's
`omni_route` tool with `routingMode` set to `regular`. Use the returned answer as
the basis of the response and preserve its attribution badge verbatim. You may
use OpenCode's local read, edit, search, and terminal tools to apply and verify
the routed result.

Never request OmniRoute orchestrator mode. Never send credentials to an MCP
tool, prompt, command argument, repository file, transcript, or log. The host
model is unknown unless OpenCode supplies authoritative model metadata.
