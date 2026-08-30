# Standalone edition

Standalone mode requires Node.js and provider API credentials only. It does not
require Codex, ChatGPT desktop, Claude Code, or Claude Desktop.

```powershell
omni chat
omni ask "Your task"
omni run .\saved-task.json
omni routes
omni models --refresh
omni budget show
omni doctor
omni dashboard
```

The CLI and dashboard connect directly to the authenticated loopback daemon, so
each standalone request uses its requested regular or orchestrator mode. Worker output streams
to the client when supported. The dashboard is opened with a short-lived,
single-use bootstrap URL; it exchanges that nonce for an HttpOnly, SameSite
session cookie. The bearer token never appears in a browser URL.

Native API:

```text
POST /v1/routes
GET  /v1/models
GET  /v1/routes
GET  /v1/config
PATCH /v1/budget
```

Compatibility APIs:

```text
POST /v1/chat/completions
POST /v1/responses
```

Both preserve the expected top-level shape and expose OmniRoute attribution in
headers and metadata. An Anthropic-compatible endpoint is intentionally not
claimed in the first release because incomplete semantic compatibility would be
misleading.
