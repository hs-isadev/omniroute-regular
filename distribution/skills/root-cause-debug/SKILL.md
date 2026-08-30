---
name: root-cause-debug
description: Diagnose a reproducible error or failing test using evidence before proposing or applying a fix.
compatibility: opencode
metadata:
  audience: developers
---

## Workflow

1. Capture the exact failure, command, and smallest reproducible case.
2. Trace only the relevant call path and inspect nearby tests or recent changes.
3. Separate observed evidence from hypotheses; test the most likely cause cheaply.
4. Explain the root cause before changing code.
5. If a fix is requested, make the smallest fix and rerun the reproducer plus a focused regression test.

Avoid speculative rewrites and repeated broad searches.
