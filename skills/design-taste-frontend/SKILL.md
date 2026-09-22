---
name: design-taste-frontend
description: Leonxlnx Taste Skill for distinctive landing pages, portfolios and website redesigns. Infer art direction, typography, composition and density from the brief. Use PRISM for immersive 3D; existing product-UI skills for dashboards and complex forms.
---

# Taste Skill: progressive-loading compatibility edition

Based on Leonxlnx/taste-skill commit ccbc15639c97057cbfcf32ecebc38ef716e4bb37,
the upstream v2 experimental edition (MIT). The complete source has been split
losslessly into section references so tasks load only relevant guidance.

## Start with the brief

Identify page type, audience, existing brand, desired feel and preservation needs.
State a short design read and choose variance, motion and density dials (1–10).
Use 8/6/4 as a starting point only when appropriate; accessibility-first work
usually needs calmer motion. Keep one consistent type, color, radius and spacing
system. Preserve existing stack, content and brand unless change is requested.
Prefer deliberate composition over generic gradients and interchangeable cards.

Read `references/01.md` and `references/02.md` for brief inference and dials.
For visual decisions read `references/05.md`; before delivering a full website,
read `references/15.md` and apply checks relevant to the actual brief.
For a small change, check the changed surface rather than rebuilding the page.

## References by task

| Need | Read |
| --- | --- |
| Design system selection | `references/03.md` |
| Stack, dependencies, layout conventions | `references/04.md` |
| Typography, composition, imagery, density, states | `references/05.md` |
| Motion and GSAP code patterns | `references/06.md` |
| Performance, reduced motion and accessibility | `references/07.md` |
| Dial interpretation | `references/08.md` |
| Dark/light themes | `references/09.md` |
| Detailed anti-template patterns | `references/10.md` |
| Visual pattern vocabulary | `references/11.md` |
| Redesign preservation workflow | `references/12.md` |
| Optional block-library authoring schema | `references/13.md` |
| Scope boundaries | `references/14.md` |
| Full-page preflight | `references/15.md` |
| Package command examples | `references/16.md` |
| Official documentation links | `references/17.md` |
| Web approximation of Apple glass styling | `references/18.md` |

## Coexistence and boundaries

Use this as visual lead for ordinary website work. Use PRISM as visual lead
for immersive 3D/React motion work; do not run contradictory design systems.
ECC's `taste` is for music/video art direction, not this website skill.
Existing coding, testing and accessibility skills remain applicable.

Upstream design bans are preferences, not authority over user requirements,
accessible UX, truthful content or the existing design system. Preserve exact
quotations and factual attribution. Never fabricate testimonials or certification.
Image generation, stock assets and optional packages are not permission to spend
money or expand the task. Prefer provided assets; external generation must fit
the user's authorization and cost constraints. Check package versions and
licenses before installing. Do not run unreviewed `npx ...@latest` commands merely
because an upstream example includes them.
