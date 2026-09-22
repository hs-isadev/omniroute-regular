# OmniRoute hackathon skill pack

This portable pack is shared by the Antigravity and OpenCode integrations.
The package intentionally excludes the local `taste` and `skillopt` skills.

## Included skills

- `omniroute-first-delegation` — route eligible reasoning through OmniRoute.
- `tdd-workflow` — choose spike, focused-TDD, or smoke-first validation.
- `focused-implementation` — make small, coherent code changes.
- `focused-code-review` — find actionable correctness and security risks.
- `root-cause-debug` — diagnose reproducible failures before editing.
- `verify-change` — run the smallest useful executable verification.
- `cartodex` — map unfamiliar repositories and architecture.
- `accessibility-agents` — audit keyboard, screen-reader, ARIA, and WCAG risks.
- `design-taste-frontend` — shape ordinary web UI art direction.
- `prism` — build and verify immersive React/Three.js interfaces.
- `scrapling-official` — perform bounded, requested web extraction safely.

The installer copies these skills into the selected workspace's
`.agents/skills` directory. OpenCode discovers that compatibility location, and
Antigravity treats it as its workspace skill directory. Codex remains an
explicit integration target so it never overwrites an existing global setup
without the user's `omni integrate codex --user --apply` action.
