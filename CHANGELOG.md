# Changelog

## 0.1.0 - Regular Windows distribution

- Portable Node.js 22.23.2 + OpenCode 1.18.25, with pinned upstream integrity verification.
- Per-user, no-admin setup and desktop launch/settings shortcuts.
- Local masked API-key form with Windows DPAPI encryption and validation before activation.
- OpenRouter free host plus six optional free/evaluation worker providers; regular mode only in this launcher.
- Separate runtime and OpenCode profile; no Codex/Claude integration or startup task installed.
- Actual host-model response labels and four compact on-demand skills.
- Runtime-scoped daemon locking and clean-profile installation smoke tests.
- Windows CI builds and tests a downloadable ZIP without API secrets.

Known limits: unsigned installer; Windows x64 only; OpenRouter host quota can stop chat independently of worker-provider quotas; provider free tiers and eligibility can change. This release has no in-place binary updater. Do not share an installed profile or vault.
