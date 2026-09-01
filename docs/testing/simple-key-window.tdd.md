# Simple Windows key window

User requested an alternative to confusing Notepad entry. Reused the existing
Windows Forms/settings backend instead of creating a browser service. The local
Open-OmniRoute-Keys launcher now opens the form with explicit app/runtime paths
and a hidden console. Simple mode omits credit-based HF/Vercel fields and the
optional extra candidate-probe checkbox. Keys use masked boxes and stdin to the
existing validation/encrypted-vault backend, not files or command-line arguments.
Existing Notepad pending files are not read, imported, or deleted by the form.

TDD: `node --test distribution/key-launcher.test.mjs`.
RED: three assertions still selected key-editor.mjs; simple form parameter was absent.
GREEN: all four tests passed, including actual Windows Forms control construction
and missing/stale/invalid installation marker cases.
`node --test distribution/settings.test.mjs`: 12 passed, including native Windows
DPAPI round trip, failed replacements, and free-only policy tests using fixture keys.
PowerShell coverage was not instrumented. This turn did not submit any live keys
or automate the actual Save button. No publication or checkpoint commits; sealed ZIP unchanged.

Security-review influenced reuse of stdin and encrypted storage rather than a
new local web server. Worker suggestions verified against the existing code.

OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: gemini/gemini-3.1-flash-lite (low) · task: medium · route: 00MTHE0HOVXGUZIH6WBKQCSG
