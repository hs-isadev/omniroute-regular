# Windows installation

## Per-user install

From an extracted or cloned OmniRoute source tree, preview and then apply the
installer. It copies the verified application to `%LOCALAPPDATA%\OmniRoute\app`,
creates a user-only command shim, runs setup, and registers/starts the current-
user logon task. No administrator elevation is required.

```powershell
.\installers\windows\install.ps1
.\installers\windows\install.ps1 -Apply
```

Open a new terminal after installation so the updated user `PATH` is visible,
then run `omni doctor`. Existing application files are moved to a timestamped
backup under `%LOCALAPPDATA%\OmniRoute\backups`; runtime configuration and the
encrypted vault are not replaced.

## Development/source install

```powershell
npm install
npm run check
npm link
omni setup
```

`omni setup` is idempotent and creates mutable state under
`%LOCALAPPDATA%\OmniRoute`, never in the repository.

## Automatic startup

```powershell
omni service install --dry-run
omni service install --apply
omni service start
omni service status
```

The installer registers a current-user Task Scheduler 2.0 logon task with
`InteractiveToken`, least privilege, absolute paths, the same Windows identity
used by DPAPI, single-instance behavior, and a bounded three-attempt restart
policy. It does not store a Windows password, use S4U, or require elevation.

The daemon holds a current-user Windows named-pipe lock. Its browser interface
requires HTTP, so it also binds explicitly to `127.0.0.1`, never to wildcard
interfaces.

Stop or remove startup:

```powershell
omni service stop
omni service uninstall
```

## First credential handoff

After setup, edit this exact local file:

```text
%LOCALAPPDATA%\OmniRoute\import\credentials.txt
```

Do not paste keys into chat. Run `omni secrets import` after saving it locally.
