---
name: coding-standards
description: Apply maintainable, idiomatic coding practices while implementing or reviewing changes in an existing codebase.
---

## Guidance

- Follow the repository's established conventions before introducing a new pattern.
- Prefer the smallest clear solution; avoid speculative abstractions, duplicate logic, and unrelated cleanup.
- Keep interfaces, types, errors, and side effects explicit at system boundaries.
- Add comments only when they explain a non-obvious reason or constraint.
- Preserve compatibility and nearby user changes; validate the behavior affected by the change.

Do not apply language-specific rules blindly. When project conventions conflict with a general preference, follow the project unless it creates a concrete correctness or security issue.
