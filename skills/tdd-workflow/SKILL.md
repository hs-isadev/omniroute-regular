---
name: tdd-workflow
description: A practical test-first workflow for hackathon and production coding. Use focused tests for risky behavior without blocking prototypes with arbitrary coverage or commit requirements.
metadata:
  audience: vibecoder
  workflow: red-green-refactor
---

# Practical TDD for fast builders

Use this skill when adding a feature, fixing a bug, or refactoring code. Keep
the feedback loop short and choose the smallest evidence that protects the
behavior being changed.

## Choose the lightest useful lane

- **Spike:** for an unknown API, UI idea, or hackathon experiment. Make a tiny
  disposable probe or mock first, record what you learned, then keep or delete
  it before polishing.
- **Focused TDD:** for business logic, routing, data transforms, auth,
  persistence, or a bug with a reproducible failure. Write one failing test,
  make it pass, then add the highest-value edge cases.
- **Smoke-first:** for wiring, configuration, packaging, and UI flows. Run a
  narrow executable smoke check before adding deeper tests.

Do not demand 80% coverage, end-to-end browser tests, or checkpoint commits for
every change. Increase test depth when the code is shared, risky, persistent,
security-sensitive, or likely to regress. A working prototype may ship with a
documented test gap and a follow-up task.

## Fast loop

1. State the user-visible behavior and one or two acceptance checks.
2. Inspect the existing test runner and nearby tests; do not invent a second
   framework.
3. Add the smallest useful RED test or smoke reproducer. If a spike is the
   right lane, say why and keep it isolated.
4. Implement the smallest GREEN change. Preserve unrelated edits and do not
   refactor while the failure is still unexplained.
5. Add boundary/error coverage for the highest-risk path, then run the focused
   check again.
6. Run typecheck/lint or a package smoke test when the change crosses a module
   or release boundary. Record what was not run.
7. Before handing off, report the behavior changed, commands run, result, and
   one honest limitation. Commit checkpoints are useful when the user wants
   them, but are not a prerequisite for a hackathon iteration.

## Hackathon defaults

- Prefer a deterministic fake or local fixture over a live provider call.
- Test the happy path plus the failure most likely to waste user time.
- Keep tests readable enough that a teammate can extend them tomorrow.
- Use a manual checklist for visual polish when automated UI coverage would
  cost more than the feature.
- Convert a successful spike into focused tests before calling the behavior
  stable or sharing it broadly.

## OmniRoute and host safety

For substantive bounded reasoning, use the OmniRoute MCP skill first when it is
available and send only the minimized task packet. Keep file edits, commands,
credentials, approvals, and final verification with the host. Treat worker
output as a suggestion and preserve its attribution. Never send API keys,
cookies, auth files, private prompts, or unrelated personal data to a worker.
Do not use tests or retries to evade provider quotas, rotate accounts, or enable
paid billing.
