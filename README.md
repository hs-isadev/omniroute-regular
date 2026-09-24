# OmniRoute Regular 0.2.9 Windows / 0.2.8 Linux

One-click installer downloads for Windows 10/11 x64 and Linux x64 desktops.
Each package includes the OmniRoute runtime, provider integrations, setup
scripts, and bundled dependencies. Personal API keys and account sign-ins are
not included.

## Downloads

- [Windows x64 installer](OmniRoute-Regular-0.2.9-windows-x64.zip) — SHA-256: `f815bc8e7d94c2769a44e88bada3d75c4adebf6c71e0452e04d34a99ec03c9ed`
- [Linux x64 installer](OmniRoute-Regular-0.2.8-linux-x64.tar.gz) — SHA-256: `22c57d80268265123b4b6570d484278eed765ada2dcf19361ffb9258c736c705`

The 0.2.9 update is Windows-only; the Linux 0.2.8 package is unchanged.

## Install

1. Download and extract the package for your operating system.
2. Windows: double-click `Setup.cmd`. Linux: run `sh Setup.sh` in the extracted
   folder.
3. Follow the guided prompts. The Windows key popup has provider labels, **Get
   key** links, and six masked key slots per provider. You can leave unused
   slots blank or skip key setup and sign in to supported browser providers.
4. After key validation, the popup lists providers whose connection check
   passed and are enabled, providers that connected but remained disabled
   (their entered keys are not saved), and any keys that could not be
   validated. Timeouts retry once before fallback.
5. Sign in to Antigravity and any consumer accounts yourself; credentials and
   browser sessions stay on your device.

The setup is one-click to start, then interactive for API keys, sign-ins,
project selection, and operating-system prompts. Windows setup is per-user.
Linux requires a logged-in desktop session and an unlocked Secret Service
keyring; it may request administrator approval only to install missing system
keyring prerequisites. OmniRoute itself runs as your normal user.

Provider availability, free quotas, and account terms vary. A successful key
check confirms connectivity at setup time; it does not guarantee future quota
or uninterrupted service.
