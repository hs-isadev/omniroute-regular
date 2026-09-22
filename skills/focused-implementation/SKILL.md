---
name: focused-implementation
description: Implement a small, clearly scoped code change with minimal exploration and focused validation. Use for bounded feature or fix requests; not broad refactors.
---

# Focused implementation

Inspect only the files needed to locate the behavior and relevant tests. Make the smallest coherent change while preserving unrelated work and existing conventions.

Run the narrowest relevant check first. Expand validation only when the change's risk warrants it. Report changed files, validation performed, and any remaining limitation concisely.

Do not add dependency upgrades, broad cleanup, or adjacent features unless requested.
