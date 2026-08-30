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
