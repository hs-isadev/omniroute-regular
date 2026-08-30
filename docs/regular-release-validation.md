# Regular Windows distribution validation

Release preparation: 2026-08-30. The live OmniRoute installation was not modified.

- 140 existing regression tests passed (including routing, provider adapters, streaming, local auth, integration generation, and Windows installer rollback).
- Six regular-settings tests cover free-only defaults, required-key failure safety, encrypted storage, failed replacement preservation/trusted endpoints, real Windows DPAPI round trip, and incomplete Cloudflare credential-pair replacement. Credentials are synthetic; inference is mocked.
- 15 deterministic routing evaluation fixtures passed. Their historical paid-model simulation costs are fixture outputs, not real charges or the regular package's pricing.
- Portable smoke test checks the extracted archive, installation into a path with spaces, safe rerun, PowerShell 5.1 parsing, masked Windows Forms controls, bundled Node/OpenCode versions, DPAPI, real OpenCode resolved configuration, MCP connection, and daemon health. No live LLM request or real API key is used by this test.
- Runtime downloads use pinned digests from the official Node release and npm package metadata. Workspace links are dereferenced and production-dependency licenses retained.
- This is a clean-profile simulation on an existing Windows machine, not a fresh Windows VM or a guarantee of future provider availability. GUI control construction is automated; visual layout and a human entering real keys are not covered by that smoke test.

Packaging exposed and fixed the daemon's account-wide lock collision: independent runtime profiles now have independent locks. Same-profile duplicate-daemon protection remains covered by regression tests. A pre-existing hook test expected outdated wording and now accepts the current explicit authoritative-metadata requirement.

An OmniRoute worker supplied preliminary packaging suggestions. The host verified suggestions against the code and official runtime sources; unsupported suggestions were not used. Preserved attribution:

OmniRoute · orchestrator: omniroute/deterministic-direct (none)
worker: groq/groq/compound (low) · task: critical · route: 00MTFYGFIB_PKPJLIKYH2UTG

The GitHub operations skill guided source/release separation and the CI-before-release gate. No credentials, private runtime state, personal profiles, or local diagnostic logs belong in the repository or ZIP.

## 0.1.1 follow-up — 2026-08-31

The user explicitly requested the provider expansion in both the portable package and their existing installation. The live catalog and key editor were updated with a source backup; its regular mode, port 47831, and original seven enabled providers were preserved. Five additional choices remain disabled pending the user's own credentials and free-tier confirmation. No vault contents were copied to the repository or archive.

All 143 regression tests and nine settings tests passed. The updated Windows form's 13 masked fields (12 providers plus Cloudflare account ID), scrolling, existing-mode preservation and same-provider validation fallback were checked. The extracted 0.1.1 ZIP passed the clean-profile OpenCode/MCP/daemon smoke test. A subsequent failed-replacement preservation fix passed the settings suite and was included in the final sealed ZIP.

A tiny no-key probe of Kilo's documented public free endpoints returned HTTP 503 for `kilo-auto/free` and HTTP 200 with a nonempty answer for `openrouter/free`; the latter reported `nvidia/nemotron-3-super-120b-a12b:free`. This is not a credentialed test of the five new personal accounts. New credentials are validated on entry.

The API Connector Builder skill guided reuse of the existing provider catalog, encrypted import path, and adapter tests. The OmniRoute research worker returned a provider error; official sources were checked directly and no native-agent fallback was used. Publication remains paused.
