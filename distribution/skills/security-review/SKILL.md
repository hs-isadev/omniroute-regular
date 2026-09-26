---
name: security-review
description: Review changes involving authentication, credentials, user input, network boundaries, permissions, or sensitive data for concrete security risks.
---

## Review focus

- Validate and constrain untrusted input at the boundary where it enters.
- Keep secrets out of source, logs, command output, prompts, and package artifacts; use the established secure storage path.
- Check authorization, least privilege, safe defaults, error handling, and data exposure relevant to this change.
- For filesystem or process operations, check path validation, quoting, symlinks, and unintended destructive scope.
- Add or run focused tests for plausible abuse and failure cases.

Report actionable findings with location and impact, ordered by severity. Do not claim an exhaustive audit from a focused review, and do not make security-sensitive changes outside the user's request.
