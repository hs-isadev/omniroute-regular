---
name: focused-code-review
description: Review a patch or small code area for concrete correctness, security, regression, and test risks. Use when the user asks for code review.
---

# Focused code review

Read the diff and only enough surrounding code to understand affected behavior. Prioritize correctness, security, data loss, compatibility, and missing regression coverage.

Report only actionable findings supported by file and line evidence, ordered by severity. If none are found, say so and mention any meaningful untested risk.

Do not edit unless asked, summarize every changed line, or manufacture style findings.
