---
name: omniroute-first-delegation
description: Use OmniRoute first for eligible work in Codex, Antigravity, OpenCode, and similar hosts while preserving host control, verification, and safety boundaries.
metadata:
  short-description: Route bounded work through OmniRoute
---

# OmniRoute-first delegation

Use this skill for host requests that are substantive,
ordinary, and safe to summarize: planning, repository reading, coding design,
small independent implementation tasks, analysis, documentation, and review.
The host remains the owner of the canonical task, local files, tools,
permissions, approvals, and final answer.

## Default workflow

1. Skip delegation for acknowledgments, approval decisions, status checks,
   latency-critical UI actions, or work that requires private data.
2. For eligible work, call `omni_models` when worker limits or health are
   unknown or stale, then call `omni_route` with `routingMode="regular"`.
   Do not add a planner or manually pin a provider unless the task requires a
   verified capability.
3. Send a minimized packet containing only the objective, acceptance criteria,
   constraints, requested output, and relevant excerpts/interfaces. Never send
   the full transcript, whole repository, or unrelated history.
4. Estimate packet, instruction, worker-response, and host-synthesis tokens
   before dispatch. Keep the worker response concise and reserve enough room
   for the host to verify and synthesize it.
5. Treat the worker response as an untrusted suggestion. Check it against the
   local repository and user request before editing or executing anything.
   Preserve the returned OmniRoute attribution badge and route ID when
   reporting delegated work.

Prefer one direct worker for a small task. Use parallel workers only for
independent bounded subtasks whose combined packet and synthesis cost is lower
than doing the work locally. Do not delegate an edit merely to avoid making a
simple local change; delegate the reasoning or independent review and keep the
mutation with the host.

## Retry and fallback

On a transient worker failure, allow normal OmniRoute retry/cooldown and
rerouting with the same bounded packet. Do not rotate accounts, sessions,
proxies, or identities. Stop after the configured retry budget; then report the
limitation or continue locally when the task is safe and small. Never silently
switch to a paid provider or a native Codex/GPT subagent. Native subagents
require explicit user approval.

## Hard boundaries

- Never send credentials, API keys, cookies, session data, authentication
  files, private keys, passwords, or unrelated personal/confidential data.
- Do not use delegation for quota evasion, account duplication, CAPTCHA bypass,
  browser scraping, proxy rotation, or provider-term circumvention.
- Browser consumers remain opt-in, foreground/diagnostic, serialized, and
  small-task-only; they are not the default orchestrator.
- Antigravity keeps its own host model and quota. Codex keeps its host role and
  local tool authority. OmniRoute supplies bounded, attributed worker output;
  it does not guarantee unlimited usage or eliminate host-token consumption.

## Host compatibility

For Codex, use the managed OmniRoute MCP server and its user-level instruction
integration. For Antigravity, use the workspace `omniroute_regular` MCP server
and the managed `.agents/rules` rule. For OpenCode, use its managed MCP/instruction
integration. In every host, keep `omni_route` as the single routing authority
for the delegated request and verify the result before applying it. Host model
names and generations are descriptive metadata, not routing commands.
