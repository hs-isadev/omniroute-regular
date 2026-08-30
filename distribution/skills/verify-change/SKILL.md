---
name: verify-change
description: Validate an implemented change with the smallest useful checks and a concise evidence-based verdict.
compatibility: opencode
metadata:
  audience: developers
---

## Workflow

1. Identify the changed behavior and its highest-risk failure mode.
2. Prefer existing focused tests, type checks, linters, or a tiny smoke test.
3. Do not rerun expensive suites when a recent valid result already covers the unchanged code.
4. State PASS, FAIL, or PARTIAL, followed by commands run and important results.
5. Call out checks not run and why.

Do not claim verification from inspection alone when an executable check is available.
