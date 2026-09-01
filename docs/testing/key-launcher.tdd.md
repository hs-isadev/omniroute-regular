# Key launcher: missing active-version marker

User reported Get-Content failure for active-version.txt. The launcher wrongly
required completed host installation merely to locate Node for local key entry.

Fix: use the existing SHA256-pinned bundled Windows Node, or the standard
Program Files Node installation if no bundle exists. Check Node >=22. Retain
the exact LOCALAPPDATA/OmniRouteRegular data profile. Do not create a fake
installation marker, move credentials, or modify the vault during preflight.

Command: `node --test distribution/key-launcher.test.mjs`.
RED: all three cases failed (missing marker, stale version, invalid marker).
GREEN: all three passed. CheckOnly starts no editor and creates no data profile;
existing markers remain unchanged. Real-profile preflight also passed.
Bundled hash verification uses .NET so it does not depend on Get-FileHash module loading.
No PowerShell coverage instrumentation was available; the standard-Node fallback
and rejection branches were inspected but not separately exercised.
No commits or publication; the sealed download remains unchanged.

Bounded worker advice checked locally; marker absence is not proof Node is absent.
No secrets were sent to the worker.

OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/groq/compound (low) · task: small · route: 00MTHDPM5XMZIAP878FKVMPQ
