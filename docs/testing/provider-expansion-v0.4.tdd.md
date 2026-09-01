# Provider expansion v0.4 — TDD evidence

## User journeys

- As a free-plan user, I can paste a Cerebras or SambaNova API key into the
  graphical installer and have only documented free-tier models activated.
- As a security-conscious user, I am not offered retired GitHub Models or
  imported web-cookie/subscription credentials.
- As an open-source recipient, I receive the upstream MIT copyright and license
  notice whenever adapted upstream material is packaged.

## RED/GREEN record

RED commit: `61d30a6 test: require safe free-provider expansion and attribution`.

- `npx tsx --test tests/provider-catalog.test.ts`: failed because the Cerebras
  and SambaNova profiles did not exist.
- focused distribution tests: failed because the graphical and text key-entry
  surfaces still had the old provider count and the package lacked the notice.

GREEN validation after implementation:

- `npm run build`: PASS.
- `npx tsx --test tests/provider-catalog.test.ts`: 17/17 PASS, including
  generic discovery, completion, generation, and streaming contracts for both
  providers.
- focused distribution suites: PASS after correcting one stale masked-field
  count caught by the tests.
- `npm test`: PASS.
- `npm run test:regular`: 83 tests; 81 PASS, 2 platform skips, 0 failures.
- `python distribution/settings-gui.test.py`: 3/3 PASS.
- `node --experimental-test-coverage --import tsx --test --test-concurrency=1 tests/provider-catalog.test.ts`:
  `packages/config/dist/provider-catalog.js` reached 100% line, branch, and
  function coverage. The process-wide total is lower because unrelated loaded
  modules are included.

## Validation boundary

No Cerebras or SambaNova secret was placed in the repository, and neither new
profile has been tested with a live owner key. Packaging and publication remain
separate gates. A user's key must pass local connectivity validation before it
is activated; that check cannot prove billing status or production suitability.
