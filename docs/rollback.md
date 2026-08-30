# Rollback and removal

Every host integration command defaults to dry-run. The report names every file
and shows a redacted line diff before `--apply` is accepted.

On apply, OmniRoute:

1. validates the existing TOML/JSON structure;
2. rejects unmanaged ownership conflicts;
3. creates timestamped backups under
   `%LOCALAPPDATA%\OmniRoute\backups\integrations`;
4. writes atomically;
5. validates the result;
6. records original/installed SHA-256 hashes and backup paths in a rollback
   manifest.

Remove only OmniRoute-owned entries:

```powershell
omni integrate remove codex --user --dry-run
omni integrate remove codex --user --apply
```

Restore the immediately previous state:

```powershell
omni integrate restore codex
```

Restore refuses if the host file changed after OmniRoute wrote it, preventing a
rollback from silently overwriting later user edits. Claude Desktop MCPB removal
uses its supported Extensions UI.
