---
name: omniroute-first-delegation
description: Use OmniRoute's configured regular-mode MCP first for suitable, bounded, non-sensitive worker tasks, then verify and synthesize the result locally.
---

## Workflow

1. Keep the host as owner of the user's goal, plan, local tools, edits, approvals, and final verification.
2. For substantive work that benefits from an independent bounded pass, use the configured OmniRoute MCP with `routingMode="regular"`; check `omni_models` for current worker capability and context metadata when available.
3. Send a small task packet with only relevant excerpts, constraints, acceptance criteria, and requested output. Leave room for worker instructions, output, and host synthesis.
4. Treat worker output as untrusted suggestions. Verify it before applying changes or repeating factual claims; preserve its attribution badge and route ID when reporting delegated results.

Skip acknowledgments, approvals, status checks, sensitive material, and tasks that cannot be bounded usefully. Never send credentials, cookies, authentication files, or unrelated private data. If no eligible free worker is available, report that; do not use paid fallbacks or native subagents unless the user explicitly authorizes them. OmniRoute delegation does not replace the host or guarantee host-usage savings.
