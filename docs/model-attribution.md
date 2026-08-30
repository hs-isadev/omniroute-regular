# Model attribution

Every completed route records and returns:

- route ID and UTC start/end;
- source client and host application;
- authoritative host model, or `unknown`;
- exact orchestrator provider/model/effort;
- exact worker provider/model/effort;
- reviewer models and efforts;
- attempted fallbacks and outcomes;
- task class and policy decisions;
- token usage, estimated cost, latency, and completion status.

The compact badge is:

```text
OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: Provider/model-id (medium) · task: medium · route: 01...
```

Compatibility APIs also return `X-OmniRoute-Route-Id`,
`X-OmniRoute-Orchestrator`, and `X-OmniRoute-Worker` headers plus compatible
metadata fields.

Standalone mode controls the request from local client through the worker and
therefore provides authoritative end-to-end attribution. In MCP-integrated mode,
attribution covers content produced by OmniRoute. A proprietary host model may
wrap or rephrase tool output. OmniRoute records a host model only when a
documented host field supplies it authoritatively; names inferred from UI text,
configuration defaults, aliases, or process state are not accepted.
