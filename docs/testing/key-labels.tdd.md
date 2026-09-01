# Provider-labelled key entry

User request: simple provider-colon slots, acquisition links, and encrypted storage.

The editable file is explicitly temporary plaintext, not an encrypted text editor.
The existing importer validates credentials and stores accepted values in its encrypted vault;
successful plaintext values are removed, failed/pending edits are retained.
No real keys are exported into the template or included in the package.

Tests: `node --test distribution/key-editor.test.mjs` (Node native runner).
RED: three intended failures for colon labels, alias parsing, and failed-key rewritten format.
GREEN: same test target passed 10 tests, zero failures, one Linux-only skip on Windows.
Coverage: `node --test --experimental-test-coverage --test-coverage-include=distribution/key-editor.mjs distribution/key-editor.test.mjs`
reported 89.76% lines, 83.18% branches, 85.71% functions. Linux GUI and CLI error paths remain untested here.
The local launcher uses the updated source; the previously sealed preview ZIP is unchanged.
Existing tests cover encryption, failed imports, concurrent edits, private paths and permissions.
Checkpoint commits omitted: this remains local unpublished work pending user provider tests.

LongCat is intentionally not accepted: its current official API pricing is nonzero,
and the official changelog retires the former free models on May 29, 2026.
Sources checked August 31, 2026:
https://longcat.chat/platform/docs/Pricing/LongCat-2.0.html
https://longcat.chat/platform/docs/ChangeLog.html

OmniRoute advisory was verified against the implementation. We do not promise secure
erasure or invent vault lock-screen settings. No credentials were sent to the worker.

OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/openai/gpt-oss-120b (low) · task: critical · route: 00MTHD4LM9QW9X-YBDSMVBXG
