# Hackathon skill pack

The one-click Regular package includes a portable, practical skill pack for
fast building. Setup copies it into the selected workspace at
`.agents/skills/`, which is recognized by Antigravity and OpenCode. It also
checks for existing Codex/OpenCode installations and applies the managed
global integration only when those hosts are present; user-owned files are
never overwritten. Codex can be attached explicitly with:

```powershell
omni integrate codex --user --apply
```

Included: `omniroute-first-delegation`, `tdd-workflow`,
`focused-implementation`, `focused-code-review`, `root-cause-debug`,
`verify-change`, `cartodex`, `accessibility-agents`, `design-taste-frontend`,
`prism`, and `scrapling-official`.

The included `tdd-workflow` is intentionally lightweight. It chooses between a
disposable spike, focused test-first work, or a smoke check; it does not force
80% coverage, browser E2E tests, or checkpoint commits on every hackathon
iteration. It still requires executable evidence for risky behavior and an
honest report of untested gaps.

The opinionated `taste` and measurement-only `skillopt` skills are excluded.
System-owned Codex skills are not redistributed; the bundle only carries the
user-owned, portable skills that work across hosts.
