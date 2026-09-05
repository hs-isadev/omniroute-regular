# OmniRoute Private Family Package

This package is for private, local/family use only. Do not publish or upload it.

Run `Install-Windows.cmd` on Windows or `sh Install-Linux.sh` on Linux. Setup keeps the existing BYOK and developer-host features, then opens one dedicated Opera/Chromium profile with sign-in tabs for Claude, Z.AI, Qwen, Kimi, DeepSeek, and Perplexity. The shared window minimizes after all six sites are ready and restarts in the background at user login.

All browser consumers share one persistent profile named `browser-consumer-profile` and the loopback-only CDP endpoint `127.0.0.1:47842`. The package supports Chrome, Edge, Opera, Opera GX, Brave, Vivaldi, and Chromium on Windows or Linux.

If a site is unavailable, signed out, rate-limited, or its UI has changed, the adapter returns a retryable unavailable result so OmniRoute can continue to another eligible free provider. It does not solve CAPTCHAs, bypass anti-bot or access controls, or read/export cookies, passwords, local storage, or session files.

Consumer-service terms can restrict automated access even for private use. You are responsible for using each adapter only where the service's current terms and your account permissions allow it. Prefer an official API or a local model server when available.

No browser profile, account session, API key, password, or cookie is included in this package. Sign-in state is created locally after installation.
