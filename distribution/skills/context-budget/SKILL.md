---
name: context-budget
description: Reduce unnecessary context use across instructions, skills, tools, repository reading, and delegated tasks while preserving enough detail to do the work correctly.
---

## Workflow

1. Identify what is consuming context: repeated instructions, oversized files, irrelevant history, tool schemas, or oversized worker packets.
2. Prefer targeted searches and relevant excerpts over loading whole repositories or transcripts.
3. When delegating through OmniRoute, check available worker context limits when possible and reserve room for instructions, the response, and host synthesis. Send only the minimum useful packet.
4. Keep reusable guidance concise and load specialized detail only when it applies. Preserve essential constraints and decisions when summarizing a long task.
5. Give a short prioritized recommendation; label token counts as estimates unless measured by an authoritative counter.

Never remove user data, instructions, tools, or configuration just to save context without authorization. Never send credentials, cookies, authentication files, or unrelated private material to a worker.
