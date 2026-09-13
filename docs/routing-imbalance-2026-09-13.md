# Routing imbalance investigation — 2026-09-13

## Observed pre-change traffic

The available `OmniRoute/routes/routes.jsonl` window contains **134 completed
routes**, from 2026-08-28 09:28:57 UTC to 2026-09-13 01:57:51 UTC. This is the
available local window, not a claim about all installations or all requests.
The offline summarizer reads only an allowlisted metadata projection. No prompts,
attachments, answers, authentication material or raw error bodies were exported.

| Final provider | Routes | Share |
|---|---:|---:|
| Groq | 118 | 88.06% |
| Gemini | 14 | 10.45% |
| Claude browser | 2 | 1.49% |

| Task class | Groq | Gemini | Claude browser |
|---|---:|---:|---:|
| micro | 2 | 1 | 0 |
| small | 73 | 9 | 2 |
| medium | 20 | 4 | 0 |
| large | 2 | 0 | 0 |
| critical | 21 | 0 | 0 |

MCP-origin traffic: 115 Groq and 13 Gemini routes. CLI-origin traffic: 3 Groq,
1 Gemini and 2 Claude browser routes. Source-host/model detail and all requested
aggregate dimensions are in the local `test-artifacts/routing-before.json` file.
112 Groq routes have no recorded fallback; 6 have fallback entries. Gemini has
8 without and 6 with; Claude has 2 without. Across the whole window, six routes
record rate-limit policy decisions. Twelve record provider-first selection.
132 bypassed a planner; all 134 enforced free-only policy. 35 record lightweight
preference and 97 quality preference; two older routes omit that dimension.

**Evidence limitation:** these legacy records do not contain required capability
sets, full candidate eligibility decisions or historical health snapshots. They
also do not retain registry snapshots behind their IDs. Capability and selected
health shares are therefore explicitly `not-recorded`. Old fallback arrays can
include a model replacement without an actual failure. Current settings cannot
prove which alternative was healthy at the time; this report does not reconstruct
or read historical prompts to guess missing dimensions.

## Root causes found in code and local configuration

1. The traffic window belongs to the legacy `AppData/Local/OmniRoute` profile.
   Its saved provider order is Claude browser, Groq, Gemini, OpenRouter, Ollama,
   then additional APIs. It does not explicitly configure Qwen or Kimi. The
   distinct `OmniRouteRegular/data` profile enables all six browser consumers,
   Kilo, Z.AI API and OpenCode Zen; Groq and Gemini are disabled there. No route
   history file was available in that Regular profile at inspection time.
2. The original core selector picked the **first eligible browser** with
   `configured.find(...)`; Qwen and Kimi could be starved by an earlier browser.
   It rotated APIs only when no browser qualified, advanced only on completion,
   omitted cooldowns from that initial provider decision, and reset its cursor
   when its process restarted. Its Antigravity tier sort could override provider
   rotation. These are code-level sources of bias, not proof of every historical
   Groq selection. The installed 0.6.3 runtime contained these same branches.
3. The OpenCode chat path independently seeded the first configured available API
   on every request. It had no rotating provider selection at all.
4. Free failover re-ranked the chosen model before attempting it. A successful
   initial model could be silently replaced and labeled as a fallback. This
   obscured whether an alternative failed or was merely reordered.
5. Browser consumers support small text/coding tasks, 32,768 context tokens and
   4,096 maximum output tokens. Their metadata does not support vision, web,
   native tool calls or structured output. The classifier can request these
   capabilities even for short requests (e.g. explicit JSON, research or tools).
   Medium/large/critical classes and demanding coding's configured tier-four
   floor exclude the smaller browser candidates as intended. These limits were
   kept; no historical task was reclassified from its prompt.
6. **Global MCP startup blocker:** Codex already had `mcp_servers.omniroute`
   enabled and pointed at the Regular runtime/profile, with a 15-second startup
   timeout. But `assertRegularProviderPolicy` trusted API-key providers only.
   Enabled browser consumers caused startup rejection before any tools registered.
   The rejection was reproduced by running the policy against the local profile,
   without loading credentials or sending any prompt.
7. The configured shared browser endpoint `127.0.0.1:47842` was not listening
   (`ECONNREFUSED`). After the server-policy repair, all six browser routes still
   correctly reported unhealthy. Starting the supported background launcher with
   the existing dedicated profile restored the endpoint. The launcher reported
   that Z.AI, Qwen, Kimi and DeepSeek need user sign-in. No credentials, cookies,
   consumer identities or fingerprints were changed; no inference was sent.

## Change and validation

Regular selection now balances least-dispatched eligible providers, then equally
ranked models, with counters advanced before I/O. Explicit priorities and strict
provider/model pins remain intentional preferences. Browser limits, adapter
pacing, provider concurrency, quotas, health, cooldowns and classification remain
eligibility gates. The selected candidate is attempted exactly first; fallback
only follows failure or loss of eligibility. New content-free diagnostics record
initial selection and execution separately, including zero-candidate failures.
See `docs/routing-policy.md` for configuration and reason codes.

The startup validator now accepts the six supported local browser adapters only
with trusted packaged paths, a loopback endpoint, known free models, bounded
context/capabilities and micro/small limits. Arbitrary executable paths and
capability/limit expansion remain rejected. The shared MCP backend records its
source as `regular-mcp`, not Antigravity for every host.

The registered local runtime received a recoverable seven-file hotfix with its
checksum manifest updated. Original files and manifest are preserved under
`test-artifacts/installed-routing-backup-20260913`. The actual installed server
completed initialize + tools/list in approximately 2.2 seconds and advertised
`omni_route`, `omni_models`, `omni_routes`, `omni_usage`. An already-open Codex
session can still require reconnect/restart to load the repaired server; changing
files cannot inject a new tool into this session's fixed tool catalog.

| Synthetic post-change window | Groq | Qwen browser | Kimi browser |
|---|---:|---:|---:|
| 36 selector dispatches, equally eligible healthy candidates | 12 | 12 | 12 |
| 9 completed router requests with fake providers | 3 | 3 | 3 |

Two equal model ranks per provider each received six of the 36 selections. The
end-to-end window has no artificial fallback entries. These are representative
regression fixtures, not live inference measurements. Actual traffic is restricted
to candidates eligible in each request; no traffic share is promised for logged-out,
unavailable, cooling, quota-limited or incapable providers.

Build/typecheck passed. The full core/integration suite passed 183 tests; the final
packet and routing suite passed all 15 focused tests, including one later-added
end-to-end packet test. Distribution tests: 131 passed, 2 skipped. Final command
results are recorded in the matching local test-artifacts logs.

## Observed model distribution

| Provider/model | Routes | Share |
|---|---:|---:|
| groq/openai/gpt-oss-120b | 59 | 44.03% |
| gemini/gemini-3.1-flash-lite | 9 | 6.72% |
| groq/openai/gpt-oss-20b | 30 | 22.39% |
| groq/groq/compound | 24 | 17.91% |
| groq/groq/compound-mini | 5 | 3.73% |
| claude-consumer/claude-web-consumer | 2 | 1.49% |
| gemini/gemini-3.7-flash | 5 | 3.73% |
