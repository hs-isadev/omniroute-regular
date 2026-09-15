# OmniRoute Shareable Family Package

This package is intended for personal and family use. It may be shared as an intact verified archive; every recipient must use their own accounts and provider keys.

Run `Install-Windows.cmd` on Windows or `sh Install-Linux.sh` on Linux. Setup keeps the existing BYOK and developer-host features, then opens one dedicated Opera/Chromium profile with sign-in tabs for Claude, Z.AI, Qwen, Kimi, DeepSeek, and Perplexity. The shared window stays visible after all six sites are ready and opens visibly at user login for easier diagnostics.

All browser consumers share one persistent profile named `browser-consumer-profile` and the loopback-only CDP endpoint `127.0.0.1:47842`. The package supports Chrome, Edge, Opera, Opera GX, Brave, Vivaldi, and Chromium on Windows or Linux.

If a site is unavailable, signed out, rate-limited, or its UI has changed, the adapter returns a retryable unavailable result so OmniRoute can continue to another eligible free provider. It does not solve CAPTCHAs, bypass anti-bot or access controls, or read/export cookies, passwords, local storage, or session files.

Browser-consumer requests are serialized and conservatively paced by default: at least 20 seconds plus up to 5 seconds of jitter between starts, with a rolling limit of 30 requests per hour per adapter process. A rate-limit, verification, unusual-traffic, or access-block notice stops submission and opens a five-minute cooldown; repeated signals increase that cooldown up to one hour. These safeguards reduce burst risk but cannot guarantee that a service will permit automation or that an account will not be restricted.

Consumer-service terms can restrict automated access even for private use. You are responsible for using each adapter only where the service's current terms and your account permissions allow it. Prefer an official API or a local model server when available.

No browser profile, account session, API key, password, or cookie is included in this package. Sign-in state is created locally after installation.
