# OmniRoute Regular 0.2.7

One-click installer downloads for Windows 10/11 x64 and Linux x64 desktops.
Each package includes the OmniRoute runtime, provider integrations, setup
scripts, and bundled dependencies. Personal API keys and account sign-ins are
not included.

## Downloads

- [Windows x64 installer](OmniRoute-Regular-0.2.7-windows-x64.zip) — SHA-256: `718D0DCA3B10629EDC3059CFC9E4F44FA14E5302FE2A6929C8B809BD03A337AF`
- [Linux x64 installer](OmniRoute-Regular-0.2.7-linux-x64.tar.gz) — SHA-256: `7EFF6A28FD34E5BA1B0F7A07BC54A50D35567EDF9D0755D195E24BB4EA8DA87F`

## Install

1. Download and extract the package for your operating system.
2. Windows: double-click `Setup.cmd`. Linux: run `sh Setup.sh` in the extracted
   folder.
3. Follow the guided prompts. The Windows key popup has provider labels, **Get
   key** links, and six masked key slots per provider. You can leave unused
   slots blank or skip key setup and sign in to supported browser providers.
4. After key validation, the popup lists providers whose connection check
   passed and are enabled, plus any new keys that could not be validated.
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
