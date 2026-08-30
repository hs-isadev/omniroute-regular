# Changelog

## 0.1.2 - Linux desktop support

- Linux x64 tarball bundles pinned Node and OpenCode binaries, alongside the Windows ZIP.
- Linux per-user setup, launch and settings scripts, hidden terminal key entry, and Secret Service backed encrypted vault. No plaintext credential fallback.
- Integrity-checked Linux installation stages versioned binaries and preserves keys, workspace and history on rerun.
- Linux CI exercises an isolated synthetic GNOME keyring, private file permissions, installer, real OpenCode/MCP connection and daemon health; Windows checks remain in place.
- Both packages retain regular-mode free routing and the same 12 provider choices. ARM, Alpine/musl and headless Linux are outside the supported installer target.

## 0.1.1 - More free-provider choices

- Added Kilo's free-model gateway adapter and credential import support.
- Exposed Z.AI, NVIDIA, Vercel and OpenCode Zen alongside the original seven providers: 12 choices in a scrolling masked-key form.
- Added a key editor for existing installations that preserves modes, port, old keys and disabled providers; accepted additions join both modes' worker routing.
- Credential checks try the same provider's configured free fallback models, without crossing into paid models.
- Documented current free-access restrictions and excluded retired GitHub Models and Cerebras's expiring, payment-method-required trial.

## 0.1.0 - Regular Windows distribution

- Portable Node.js 22.23.2 + OpenCode 1.18.25, with pinned upstream integrity verification.
- Per-user, no-admin setup and desktop launch/settings shortcuts.
- Local masked API-key form with Windows DPAPI encryption and validation before activation.
- OpenRouter free host plus six optional free/evaluation worker providers; regular mode only in this launcher.
- Separate runtime and OpenCode profile; no Codex/Claude integration or startup task installed.
- Actual host-model response labels and four compact on-demand skills.
- Runtime-scoped daemon locking and clean-profile installation smoke tests.
- Windows CI builds and tests a downloadable ZIP without API secrets.

Known limits: unsigned packages; Windows and desktop Linux x64 only; OpenRouter host quota can stop chat independently of worker-provider quotas; provider free tiers and eligibility can change. No automatic updater. Do not share an installed profile or vault.
