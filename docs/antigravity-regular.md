# Antigravity Regular setup, migration and limits

Implementation snapshot: 2026-08-31. Version 0.2.2.

## Guided setup

Run Setup.cmd (Windows) or `sh Setup.sh` (Linux). The installer verifies/copies the package and opens Notepad/the Linux desktop text editor with key slots. Save and close the editor, then confirm free-only accounts and import in the terminal. It next asks for a project folder. Press Enter to create/use a starter workspace under the install root, or enter an absolute existing project directory without surrounding quotes. It previews integration and requires **yes** before applying workspace MCP/rules and launching the official host. A missing host or integration conflict stops the flow. Declining import never connects a workspace.

Resume with Connect.cmd / Connect.sh. Keys already saved in this install are retained when their fields are blank. Settings.cmd / Settings.sh still edit keys only. Antigravity sign-in remains manual inside the official app/CLI; no passwords, sessions, browser scraping, or automatic account registration are involved. Setup never commits the user's project or credentials to Git.

For unattended installation, use `Setup.ps1 -NoWizard -NoShortcuts` or `sh Setup.sh --no-wizard`. Guided mode requires an interactive terminal. It prints first-test prompts but does not automatically spend worker quota on a second routing test or claim that the host followed a rule. See [guided setup test evidence](testing/guided-setup.tdd.md).

## Architecture and trust boundaries

Antigravity is the host/harness and owns its sign-in, host inference, filesystem access, terminal, permissions and final answer. Its child OmniRoute MCP process has three tools: bounded worker routing, model/health diagnostics, and content-free route history. Worker APIs return suggestions only. No Antigravity login tokens are imported, read, copied or proxied.

The Regular MCP entrypoint refuses orchestrator-mode and non-free configurations. It runs in process over stdio: no public socket, daemon, proxy, startup task or always-running service. Each connection admits one active route; cancellation and route timeout propagate to providers. Disconnect/reconnect starts a fresh process/cache. Multiple workspaces have separate host-owned MCP connections; cooldowns are process-local, not a global account quota coordinator.

Official [MCP documentation](https://antigravity.google/docs/mcp/) specifies workspace `.agents/mcp_config.json` and command/args/env for stdio. This package uses only that workspace file, never the global MCP configuration. Other servers and unrelated JSON keys survive a merge. Conflicts and symlink/reparse paths fail closed; pre-change backups are under `.agents/omniroute-backups`.

The workspace rule is `.agents/rules/omniroute-regular.md`. Check its activation is **Always On** in the host's Rules panel. Google documents this folder and activation option in [Rules](https://antigravity.google/docs/rules-workflows). A successful MCP client test does not prove your host loaded or followed this rule.

## Host setup and free usage

Install only from [the official download page](https://antigravity.google/download). Redistribution permission has not been established, so no Google binary is bundled. Existing app/agy installations are detected; use `Launch --host ABSOLUTE_EXECUTABLE_PATH` for a nonstandard install. The executable is launched directly, without a shell.

Complete official Google sign-in in Antigravity. Select an account-available free host model. Do not substitute a model name from an old screenshot or this README. Google describes a quota-limited free plan in [Plans](https://antigravity.google/docs/plans/); actual entitlement and remaining quota must be checked in your account. OmniRoute does not inspect or change billing. Do not enable paid credits, auto top-up or overages. If their status is uncertain, this is not a verified-free account.

When host quota runs out, this workflow can stop even with worker quota remaining. There is no silent harness or paid-model switch. Host usage and worker token counts are separate; no savings percentage is claimed.

## Credentials

Windows default install: `%LOCALAPPDATA%\OmniRouteRegular`.
Linux default install: `${XDG_DATA_HOME:-$HOME/.local/share}/OmniRouteRegular`.

Use Setup/Connect for text-editor slots, or `Connect.cmd --masked` / `Connect.sh --masked` and Settings.cmd / Settings.sh for masked/hidden input. Fields accept documented API keys/service tokens; Cloudflare also needs its non-secret account ID. Never enter passwords, consumer cookies, OAuth sessions or Claude/ChatGPT/Antigravity login tokens.

Windows uses current-user DPAPI. Linux uses Secret Service to protect the vault key; an unlocked desktop keyring and secret-tool are mandatory. Vault/data stay under the install root's `data` directory and are not in release archives. The Windows form sends values to its child over stdin; Linux reads hidden TTY input. Failed replacements keep existing keys. Saving does not modify another install's profile.

The optional masked path avoids an import file. Default editor entry uses a current-user-only `credentials.txt` under `%LOCALAPPDATA%\OmniRouteRegular-KeyEntry\<profile-id>` or `$HOME/.local/share/OmniRouteRegular-KeyEntry/<profile-id>`. It rejects Git, recognized sync-folder, symlink/reparse and hardlink locations. Unknown custom synchronization cannot be detected universally. Only provider-status metadata is shown; stored secrets are never exported. Pending populated edits survive reruns; blank templates refresh saved status. Successful values are removed from this file after vault save, failed values remain for retry, and concurrent edits stop cleanup. Editor backups, clipboard history, RAM copies, filesystem snapshots and malware are outside this protection. Cleanup is not secure erasure. Never distribute this input directory or installed data. No login-time editor startup task is added.

Strict Regular mode disables Hugging Face/Vercel credit profiles while keeping their vault records. It validates enabled endpoints, provider types, credential fields, known model IDs and zero configured prices against bundled allowlists before credential loading. Other profile modes are unchanged. Model allowlists are dated, not a proof of an account's current billing plan; a free-plan/evaluation account with no billing/overages/BYOK/top-up is required. Test evidence: [editor and policy checks](testing/key-editor.tdd.md).

A short completion validates connectivity, not billing status or coding correctness. At most three baseline model attempts per supplied provider plus an optional extra coding candidate check are made. Reconnect MCP after saving. Enabling an account free tier or disabling billing is the user's action on the provider website.

## Worker routing

Classification sees the delegated prompt, not the host's entire instruction history. It is local and deterministic. Basic Malay/mixed-language coding cues are covered; this is not a universal language classifier. Supply relevant code/context for coding subtasks. For bare continue/teruskan/sambung use the optional parentTask field; missing context produces a clear error. New questions ignore stale parentTask context.

Coding workers return text; Antigravity executes tools. The router does not infer that a worker needs tool-call APIs merely because the host's task involves repository edits. Explicit requiredCapabilities still apply.

Configured intelligence tiers and model ladders are provisional heuristics, not executable benchmark results. Demanding coding filters out tier <4 and unknown-tier workers for the whole route, including retries. Known zero configured prices, capabilities, health and context limits must pass before dispatch. No adequate capacity means failure, not a paid or tiny-model fallback.

The package retries transient/unavailable/quota failures through the remaining eligible ladder. The Regular profile disables extra same-model retry loops. Retry-After drives bounded process-local cooldowns. Authentication/invalid requests and partial streams are not replayed. Shared upstreams (e.g. OpenRouter and a gateway routing to OpenRouter) are not independent capacity.

## Logs and diagnostics

Ask for omni_models to inspect health/IDs/capabilities; it may contact providers and some static-catalog providers use tiny health probes. Ask for omni_routes to inspect route IDs, selected models, reasons, latency, fallbacks and reported worker usage. These are not host-token measurements. Missing upstream usage can appear as zero in the legacy usage schema; treat that as unknown, not proof of zero tokens.

Diagnostic JSONL logs rotate at 5 MB with one previous file; route history contains metadata, not prompts/answers. Provider errors and known secrets are redacted. The route audit file is not yet size-rotated. Never export an entire install root.

## Upgrade and rollback

Close active host/MCP sessions first. Verify and extract the new archive, then rerun Setup with the same InstallRoot (Windows) or --install-root (Linux). New payloads live in immutable-looking `versions/<version>-<digest>` directories selected by `active-version.txt`. Files are checksum-verified on install and repeated install; checksums are not signatures. Root launcher edits cause a conflict instead of overwrite. User data stays in place.

After update, rerun Launch for each previously connected project with --apply so its absolute MCP paths point to the new version. User-modified rules/MCP entries are not overwritten; reconcile those changes manually from the backup.

Run `Manage.cmd rollback` or `./Manage.sh rollback` to select the previous version, then rerun its Launch --workspace PATH --apply for each project. Generic root wrappers use the selected version. Only v0.2+ versions use this rollback pointer. Upgrading a v0.1 Windows layout retains old app/node/OpenCode files and backs up old launchers; automatic downgrade into that legacy layout is not offered. For a v0.1 Linux symlink-based install, use a new install root; keep the old root until migration is verified.

Separate GPT/Claude orchestrator configs and credentials are untouched. Do not manually point Antigravity's regular entrypoint at their data root. No legacy OpenCode user-data directories are deleted.

## Uninstall (recoverable)

First detach every connected workspace:

```text
Launch.cmd --detach --workspace "C:\path\to\project" --apply
./Launch.sh --detach --workspace "/path/to/project" --apply
```

Only unchanged package-owned MCP entry/rule/ownership files are removed. Other servers and backups remain. Then run Manage uninstall. Root launchers and install pointers move to an `uninstalled-UUID` folder; binaries and all user data remain recoverable. Delete the package desktop shortcuts manually if present. No recursive user-data deletion is performed.

## Troubleshooting and verification boundaries

- Host missing: install official Antigravity, or give --host an absolute executable path. No community OAuth proxy is supported.
- Preview only: --apply is required for workspace changes and launch.
- MCP absent: verify the selected workspace, reconnect/restart the host's MCP integration, inspect its local error output and confirm the rule activation. Older host versions may need an update through Google.
- No eligible free worker: open Settings, validate a suitable key, inspect omni_models and quotas. Do not enable paid fallback.
- Linux keyring error: use a real unlocked desktop session. Do not copy a Windows vault or use plaintext storage.
- Install busy: another install or stale .install-lock exists. Confirm no installer is running before manually removing that empty lock directory.
- Bad checksum/user-modified file: stop and inspect; do not force overwrite.

See the dated [test report](testing/antigravity-regular.tdd.md) for the exact executed checks and limitations. Real host tool adherence, model-quality ranking and native-vs-delegated host-token savings require separately authorized live tests.
