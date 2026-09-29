# TDD evidence: Windows browser-consumer autostart migration

## User journey

A Windows user upgrades OmniRoute after an older release wrote a version-pinned
`OmniRoute Browser Consumers.cmd`. On the next setup repair, OmniRoute must
replace that known legacy entry with the stable root launcher, remove the stale
command, and preserve unrelated user-managed startup content.

## Test evidence

| Guarantee | Test | RED evidence | GREEN evidence |
|---|---|---|---|
| A lone legacy version-pinned `.cmd` is migrated to the stable `.vbs` launcher and removed. | `distribution/dual-setup.test.mjs` — `Windows repair migrates a version-pinned browser-consumer CMD when the stable VBS is missing` | Focused Node test failed at `repaired.changed`: expected `true`, got `false`; repair incorrectly returned without inspecting the legacy `.cmd`. | Focused test passed after the repair path detected the legacy file and installed the stable launcher. |
| Repeated repair is idempotent, and an unrecognized same-name `.cmd` is preserved as a conflict. | Same focused test. | Not separately run before implementation. | Assertions pass in the focused test. |
| Existing regular-distribution behavior remains green. | `npm run test:regular` | — | 162 tests: 160 passed, 2 skipped, 0 failed. |

## Validation command

```text
node --test --test-name-pattern="Windows repair migrates a version-pinned browser-consumer CMD" distribution/dual-setup.test.mjs
npm run test:regular
```

No dedicated coverage script is configured for this test suite, so a percentage
coverage result is not claimed. Two tests are skipped by the existing regular
suite.
