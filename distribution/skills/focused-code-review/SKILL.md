---
name: focused-code-review
description: Review a patch or small code area for concrete correctness, security, regression, and test risks.
compatibility: opencode
metadata:
  audience: developers
---

## Workflow

1. Read the diff and only enough surrounding code to understand affected behavior.
2. Prioritize correctness, security, data loss, compatibility, and missing regression coverage.
3. Report only actionable findings supported by file and line evidence.
4. Order findings by severity. If none are found, say so and mention any untested risk.

Do not summarize every changed line or manufacture style findings. Do not edit unless asked.
