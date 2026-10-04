# Safe multi-key slots and routing — TDD evidence

## User journeys

- Adding a provider key to an occupied slot preserves the saved credential and
  saves the new one to the next free slot, reporting both slot numbers.
- Adding a duplicate key reports the already-filled slot and does not validate
  or save another copy.
- A full five-slot pool refuses another key without changing any saved value.
- Requests rotate across a provider's saved keys, including simultaneous
  requests; authentication or quota failures try another key and then another
  eligible provider.

## RED evidence

- `node --test distribution/settings.test.mjs distribution/dual-chat.test.mjs`:
  new tests reproduced replacement of a filled slot, duplicate storage, full
  pool overwrite, and concurrent OpenCode requests both selecting key 1.
- `npx tsx --test --test-concurrency=1 tests/providers.test.ts tests/free-failover.test.ts`:
  reproduced concurrent calls both selecting key 1 and HTTP 401 stopping the
  provider ladder instead of switching to a different provider.
- `python distribution/settings-gui.test.py`: reproduced the Linux key editor
  dropping the new `DUPLICATE` status from its save result.

## GREEN evidence

- `npm run check`: pass; typecheck, all 194 TypeScript tests, and all 15 local
  deterministic evaluation fixtures passed.
- `node --test distribution/settings.test.mjs distribution/dual-chat.test.mjs distribution/private-package-shortcut.test.mjs`:
  35/35 passed.
- `npx tsx --test --test-concurrency=1 tests/providers.test.ts tests/free-failover.test.ts`:
  44/44 passed.
- `python distribution/settings-gui.test.py`: 4/4 passed.
- `npm test` rerun after adding the explicit invalid-key case: all 195
  TypeScript tests passed.
- `npm run test:regular`: all 173 launcher/packaging tests passed, with 2
  Linux-only tests skipped on this Windows host.
- `node scripts/test-family-package.mjs release/OmniRoute-Private-0.6.6-private.16.zip`:
  passed against the extracted package: both manifests verified, 2,779 payload
  files scanned, Windows install/update rollback and host registration passed,
  and the installed provider pool rotated concurrent calls across two keys and
  fell through a fixture 401 to the second key. No live inference was run.
  Linux payload verification passed, but a native Linux install was not run on
  this Windows machine.

Provider requests are tested with stubbed transports and fixture credentials;
no real provider keys or accounts were used. Live provider connectivity is not
claimed by these tests.
