---
name: focused-implementation
description: Implement a small, clearly scoped code change with minimal exploration and focused validation.
compatibility: opencode
metadata:
  audience: developers
---

## Workflow

1. Restate the requested outcome in one sentence.
2. Inspect only the files needed to locate the relevant implementation and tests.
3. Make the smallest coherent change; preserve unrelated work and existing style.
4. Run the narrowest relevant check first, then broader tests only when risk warrants it.
5. Report changed files, validation, and any remaining limitation concisely.

Do not perform broad refactors, dependency upgrades, or unrelated cleanup unless requested.
