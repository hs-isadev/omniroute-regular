---
name: root-cause-debug
description: Diagnose a reproducible error or failing test using evidence before proposing a fix. Use for observable failures, not patch-review requests.
---

# Root-cause debugging

Capture the exact failure and smallest useful reproducer. Trace only the relevant path, separating observations from hypotheses, and test the most likely cause cheaply.

Explain the root cause before changing code. If a fix is requested, apply the smallest suitable correction and rerun both the reproducer and a focused regression check.

Avoid speculative rewrites and repeated broad searches.
