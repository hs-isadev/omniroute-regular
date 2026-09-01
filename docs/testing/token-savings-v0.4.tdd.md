# Token accounting v0.4 — TDD evidence

## Meaning

`providerReportedTokensOffloaded` is the sum of input and output tokens that a
provider explicitly reported for completed OmniRoute routes. It excludes routes
whose provider returned no usage metadata. It is not renamed to "tokens saved."

`actualHostTokensSaved` is `null`. Exact savings require the counterfactual
token usage of the same host doing the same task without OmniRoute, which cannot
be observed during the routed run. Prompt size, response size, or a guessed
model multiplier is not a valid substitute.

## RED/GREEN record

RED commit: `4f1b8d4 test: require honest token offload accounting`.

- The audit test failed because `tokenSavingsSummary` did not exist.
- The portable MCP test failed because its backend exposed no usage summary.

GREEN:

- Provider adapters mark usage only when the upstream response supplied it.
- Mixed/unavailable routes are not counted as provider-reported offload.
- `omni_usage` exposes the content-free summary to MCP hosts.
- The desktop **OmniRoute Usage** launcher prints the same local summary.
- Focused security, integration, and portable MCP suites pass.

No prompt or response content is added to the audit log by this feature.
