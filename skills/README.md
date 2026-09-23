# OmniRoute hackathon skill pack

This portable pack is shared by the Antigravity and OpenCode integrations.
The package intentionally excludes the local `taste` and `skillopt` skills.
The instructions are host- and model-neutral: GPT-5.x/5.6 variants, Astra, and
other configured host models may use the same pack without assuming a model
name, context size, or native-agent runtime.

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
Antigravity treats it as its workspace skill directory. Setup also detects an
existing Codex or OpenCode installation and applies the managed global
integration without overwriting user-owned files; absent hosts are left alone.
Codex can still be attached explicitly with `omni integrate codex --user --apply`.
