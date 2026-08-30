# Routing policy

## Classification

OmniRoute computes deterministic signals before selection or a planning call. Prompt
length is only one signal. The classifier also considers estimated input tokens,
attachment size/type, requested outputs, dependency depth, tools, capabilities,
risk, latency preference, budget, and expected verification effort.

| Class | Initial policy |
|---|---|
| micro | Deterministic extraction, formatting, classification, lookup, or tiny edit |
| small | One focused deliverable, simple reasoning, or one-file work |
| medium | Dependent steps, multiple files, moderate analysis, or tool use |
| large | Broad repository work, synthesis, ambiguous debugging, architecture, or long context |
| critical | High stakes, destructive risk, security sensitivity, or work benefiting from independent verification |

Risk can raise a task class. A long but deterministic formatting input need not
be large; a short production deletion instruction can be critical.

## Intent-aware free model selection

With `routing.intentRoutingEnabled` (default true), a local heuristic classifier
labels everyday questions, light writing/formatting tasks, coding, complex work,
and higher-risk requests. It makes no API call of its own. Everyday questions and
small tasks select the lightest eligible free model on the preferred provider;
technical nouns alone (for example "What is an API?") do not imply tool use.
Intensive coding, tool-heavy work, long inputs, proofs, explicit quality requests,
and high-risk work keep best-first routing. Classification is heuristic, not a
guarantee that every request is understood correctly.

"Lightest" uses configured intelligence tiers and curated model order, not a
live parameter-count benchmark across providers. Capability/context/health checks
still apply; unused web-agent capability loses ties for a plain text question.
Regular lightweight requests default to 2,048 output tokens and no reasoning
effort where supported; explicit output limits are preserved. Provider preference
still takes priority over cross-provider model size.

The intent preference persists through worker execution and retries, including
free API planners in orchestrator mode. That mode still plans; regular mode does
not. A validated complex, review-required, or higher-risk plan can raise execution
back to quality-first. Paid/native orchestration is unchanged. The classification
and preference appear in each route's audit policy decisions.

Lightweight failures try remaining same-provider models lightest-first before
another provider, so a stronger same-provider fallback is possible after a limit.
Quality-first requests retain the best-to-smaller ladder below. Turning off intent
routing restores best-first selection. This policy only affects OmniRoute calls,
not native Codex subagents or ordinary ChatGPT model responses.

## Planner behavior

Regular mode has no planner: it selects an eligible free worker using configured
provider order and deterministic model metadata. Orchestrator mode uses the
configured planner, `openrouter/openrouter/free` by default, with a strict JSON
contract. The selected underlying OpenRouter model may rotate.

The envelope contains only models that are enabled, allowed, healthy, and—while
`routing.freeOnly` is true—configured with zero input and output price. Privacy
mode truncates request content and adds metadata/hash signals. Free planners
can use the provider-first ladder below, but replacements must have confirmed
structured-output support. Paid/native host model selection is unchanged.

## Deterministic validation

The validator rejects:

- any provider/model outside the registry snapshot;
- disabled, denied, unhealthy, or unknown-capability models;
- unsupported reasoning effort;
- unknown or exceeded output/context limits;
- duplicate/unknown dependencies, cycles, or excessive fan-out;
- concurrency above policy;
- unknown pricing when a budget must be enforced;
- estimated per-request or task-class budget excess;
- unconfigured fallbacks;
- incompatible execution-mode, subtask, or reviewer combinations.

One constrained plan repair is allowed. A second invalid plan fails closed.
Planner-proposed emergency fallbacks remain disabled by default; the separate
deterministic free-model ladder is enabled by default.

## Provider-first free-model ladder

For regular workers and orchestrator-mode workers, subtasks, reviews, and free
API planners:

1. Use the selected provider's highest-ranked eligible free model.
2. On a rate/quota limit, immediately try its next eligible lower-ranked model.
3. Only after that provider's eligible models are exhausted, try the next
   enabled provider in `routing.directProviderOrder`, starting at its best model.
4. If every eligible model fails or is cooling down, stop with an error.

`providers[].freeModelOrder` is an editable, curated best-to-lighter preference
list, not an automatic benchmark or a claim that every model is physically
smaller. Unlisted configured models use intelligence/latency metadata to break
ties. Discovery refreshes availability; it never grants permission to unknown
models, infers quality from their names, or changes the allowlist by itself.

The same-provider preference outranks a different provider's stronger model.
Capability, context, output, health, credential and zero-price checks still
apply. Ineligible smaller models are skipped rather than weakening the task's
requirements. Output caps can decrease to fit a smaller model. A provider with
only one eligible model has no same-provider downgrade.

HTTP 429 and quota/payment-required HTTP 402 mark that model as cooling down.
OmniRoute honors `Retry-After` (bounded to 1 second–24 hours); without it, the
default cooldown is 60 seconds. Cooldowns are per model, shared by routes in
the running daemon, and reset on restart. A higher-ranked model becomes eligible
again when its cooldown expires. Provider-wide quotas may affect every model,
so switching models does not guarantee more allowance or bypass account limits.

Transient availability failures can move down the same ladder after ordinary
bounded retries. Authentication failures, invalid requests, cancellation and
partial streamed output do not trigger automatic model changes. Every attempted
downgrade and actual final worker/planner/reviewer is attributed; exhausted
attempts are logged even when the route fails.

Configuration switches: `routing.freeModelFailoverEnabled` (default true) and
`routing.freeModelCooldownMs` (default 60000). This automatic policy only operates
under `routing.freeOnly`; it never authorizes paid models or top-ups.

The OpenCode regular wrapper's own model remains pinned to `openrouter/free`.
This ladder governs its OmniRoute tool calls and standalone OmniRoute requests,
not model calls made directly by the OpenCode host.

## Execution and retries

Dependency-ready subtasks run in bounded waves. Provider output streams where
supported. Cancellation propagates through provider abort signals. Retries are
limited to classified transient failures and honor `Retry-After`; a stream that
already emitted output is never retried automatically because that could
duplicate cost. Emergency fallbacks run only when explicitly enabled and appear
in attribution.
