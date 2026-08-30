# Redacted setup walkthrough

This walkthrough deliberately stops before credentials are needed and never
prints, reads back, or asks for a secret in chat.

1. Preview and apply the current-user Windows installation:

   ```powershell
   .\installers\windows\install.ps1
   .\installers\windows\install.ps1 -Apply
   ```

2. Open a new terminal and confirm the local daemon and startup task:

   ```powershell
   omni service status
   omni doctor
   ```

3. The generated editable credential file is outside the repository at:

   ```text
   %LOCALAPPDATA%\OmniRoute\import\credentials.txt
   ```

   For an existing installation, run `omni setup` first to add new provider
   profiles and upgrade an empty template. A populated import is preserved;
   add any missing field names from the [credential directory](free-credentials-directory.md)
   yourself. Open the file locally with:

   ```powershell
   notepad "$env:LOCALAPPDATA\OmniRoute\import\credentials.txt"
   ```

   Run `omni providers list`. The original OpenRouter/Groq/Gemini profiles
   remain available. For each additional provider you actually want, inspect
   its dashboard and confirm free-only billing and applicable use terms, then
   enable it before importing. For example:

   ```powershell
   omni providers enable mistral --confirm-free-tier
   ```

   Other IDs: `cohere`, `cloudflare`, `huggingface`, `vercel`, `nvidia`, `zai`,
   `opencode-zen`. Repeat for chosen accounts only; do not blindly confirm all.
   Some offer evaluation or monthly credits, not permanently free models.
   No card, purchased balance, paid overage, or auto-reload should be attached
   to these credentials. If you cannot ensure that, leave the profile off.

4. Edit that file locally. Do not paste its contents into a chat, command line,
   commit, issue, or log. Save it, then run:

   ```powershell
   omni secrets import
   ```

   OmniRoute validates connectivity before atomically activating the encrypted
   vault. A failed validation leaves the existing vault and import file intact.
   A successful import clears/removes the plaintext and recreates an empty
   template. Output contains provider names and masked fingerprints only.
   Additional providers are validated using a tiny inference request, consuming
   some free quota. If one fails, the entire batch remains unactivated. Fix it
   or remove that failed entry locally and retry the other keys.

5. After import, verify free-provider access and make a first regular request:

   ```powershell
   omni service stop
   omni service start
   omni doctor
   omni models --refresh
   omni ask "Explain how this request was routed." --mode regular
   omni ask "Explain this design." --mode orchestrator
   ```

   Both routing modes use the same enabled worker pool. Restart the daemon
   after future imports or provider changes too. Disable any provider with
   `omni providers disable PROVIDER_ID`, then stop/start the daemon.

   Provider-first model downgrades are enabled automatically. No additional
   keys are required per model: one provider key serves its eligible ladder.
   `omni providers list` shows model preferences. Limited models cool down;
   OmniRoute tries suitable smaller models on that provider before another
   provider. See [routing policy](routing-policy.md) for exact behavior.

6. Install and integrate the OpenCode regular-mode harness:

   ```powershell
   npm install -g opencode-ai
   omni integrate opencode --user --dry-run
   omni integrate opencode --user --apply
   omni integrate doctor
   ```

   Launch it only through the regular-mode wrapper:

   ```powershell
   omni harness opencode --mode regular
   ```

   This command pins OpenCode and its OmniRoute MCP server to regular mode and
   the OpenRouter free router. It rejects orchestrator and subscription flags.
   A plain `opencode` launch is outside that wrapper and is not guaranteed to
   retain the pin.

If the local import file already contains edits, rerunning `omni setup` preserves
it. `omni secrets template` also refuses to overwrite it unless the user gives
the explicit `--force` flag.
