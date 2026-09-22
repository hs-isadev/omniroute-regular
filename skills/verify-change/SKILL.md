---
name: verify-change
description: Validate an existing change with the smallest useful executable checks. Use for standalone test or verification requests, not implementation.
---

# Verify a change

Identify the changed behavior and its highest-risk failure mode. Prefer existing focused tests, type checks, linters, or a tiny smoke test. Do not rerun expensive suites when a recent valid result already covers unchanged code.

State PASS, FAIL, or PARTIAL, followed by commands run and important results. Call out checks not run and why.

Do not claim verification from inspection alone when an executable check is available.
