# Guided setup v0.2.1 — TDD evidence

Date: 2026-08-31. Journeys derived from the user's request for sequential setup and less repetitive key entry.

## RED / GREEN checkpoints

- `d34a1d0`: `node --test distribution/guided-setup.test.mjs` executed six tests; all failed because `runGuidedSetup` was not implemented. The first sandbox attempt failed to spawn Node and is not counted as RED evidence.
- `b0d0a05`: the same six tests passed after implementation. Both checkpoints are on `codex/antigravity-regular`.

## Guarantees

| Behavior | Test | Evidence |
| --- | --- | --- |
| Key setup precedes workspace preview and approved launch | guided-setup.test.mjs | PASS |
| Cancelled/failed key editor never connects or creates workspace | guided-setup.test.mjs | PASS |
| Declined confirmation does not apply integration | guided-setup.test.mjs | PASS |
| Preview failure stops launch; launch failure reports possibly applied integration | guided-setup.test.mjs | PASS |
| Spaces and shell metacharacters remain literal arguments | guided-setup.test.mjs | PASS |
| Invalid state, relative roots, nonexistent projects and noninteractive input fail closed | guided-setup.test.mjs | PASS |

The sequencing tests inject child-process/UI interactions; they do not prove real account eligibility, Windows dialog interaction, Antigravity rule adherence or Linux desktop keyring availability. No real keys were entered or provider quotas deliberately exhausted. Final regression, package and coverage results will be recorded after execution.

## Security review

Guided setup reads only project paths and confirmation. Secrets remain in the existing masked Windows UI or hidden Linux TTY, then go to the existing vault backend. No credentials are added to arguments, setup output, Git or archives. The guided flow requires explicit workspace approval and never runs git in the user's project. Existing install-only switches remain available.
