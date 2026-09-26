---
name: tdd-workflow
description: Use a focused red-green-refactor loop when adding behavior, fixing a defect, or refactoring code.
---

## Workflow

1. Find the relevant implementation and existing test conventions.
2. Write or update the smallest test that captures the requested behavior; run it and confirm it fails when practical.
3. Make the smallest change that passes the test, then improve the design without changing behavior.
4. Run the focused test first and broaden validation in proportion to the change's risk.
5. Report what was tested and any gap plainly.

Do not impose a fixed coverage percentage, create checkpoint commits, or add test layers that do not fit the project. If a test cannot reasonably precede a change, explain why and verify the closest observable behavior.
