# Verification — OmniRoute Private 0.6.1-private.1

Verification date: 2026-09-08. This file records commands actually run against the source tree and final package. It does not claim a live provider succeeded unless listed below.

## Source and distribution

- `npm run build`: PASS.
- `npm test`: PASS, 169/169 TypeScript tests.
- `npm run test:regular`: PASS, 111 passed, 0 failed, 2 platform-specific skips, 113 total.
- Focused shared-browser tests: PASS, 9/9 after the final launcher/startup/probe/prompt-timing changes.
- Browser high-thinking dispatch: PASS in source tests; `high` is forwarded to all six adapters, which activate a visible provider thinking control or fail retryably.
- Browser prompt timing: PASS; all six consumers focus the prompt input, wait a fixed 150 ms, then fill it before submitting.
- `npm run test:security`: PASS, 15/15 security and vault tests.
- API-key provider selection: PASS; setup accepts all supported free provider credentials in one submission, and Cloudflare's token/account pair remains one provider record.
- `npm audit --omit=dev`: PASS, 0 production vulnerabilities.
- Shared model registry/routing ladder: PASS in source tests; Claude, Z.AI, Qwen, Kimi, DeepSeek, and Perplexity browser consumers are present and ordered before API/local fallbacks after setup.
- Browser routing priority: PASS; a Regular key configuration preserves the six browser consumers ahead of Groq and other API providers, while context, output, capability, and health filters still prevent ineligible browser dispatch.
- API routing rotation: PASS; successive healthy API-only Regular-mode requests rotate their initial provider (Groq then Gemini in the regression fixture), while same-request retries remain provider-first.
- Bounded Regular-mode swarm: PASS in focused router tests; casual and easy repetitive coding requests stay single-worker, while complex coding/high-risk work uses at most `min(3, maxParallelWorkers, maxSubtasks)` healthy eligible API workers followed by one final synthesis.
- Swarm safety and attribution: PASS in focused router tests; browser consumers do not fan out, synthesis-context overflow suppresses fan-out, rate limits fall back through the eligible API pool, failure/cancellation skips synthesis, worker outcomes are audited, and the final synthesis worker remains the primary attribution. Worker drafts are framed as untrusted data in the synthesis prompt.
- Startup migration: PASS in source tests; setup writes one shared per-user startup entry and removes only the six exact legacy per-provider entries.
- Browser launch: PASS locally with Chrome using one profile, one loopback CDP endpoint, and six tabs. Opera GX auto-detection found the installed executable but did not expose CDP while an existing Opera process tree was running; see Known limitations.

## Final package checks

- Windows manifest: PASS, 1,522 payload files.
- Linux manifest: PASS, 1,519 payload files.
- Windows install-only smoke: PASS twice and idempotent (`changed: true`, then `false`); bundled Node 22.23.2 and OpenCode 1.18.25 executed.
- Ubuntu WSL install-only smoke: PASS twice and idempotent (`changed: true`, then `false`); bundled Node 22.23.2 and OpenCode 1.18.25 executed.
- Secret-value scan: PASS, 3,054 files checked, zero matches, and no secret values printed.
- Final ZIP checksum: recorded in the adjacent `.sha256` file after sealing.

## Live browser checks

The shared browser profile was opened locally without reading cookies, local storage, password stores, or authentication databases. No challenge was solved or bypassed automatically.

- Six-provider `test_connection`: PARTIAL — Claude, Z.AI, Qwen, DeepSeek, and Perplexity passed in the first corrected-domain run; Kimi awaited manual sign-in. After restarting the stalled shared Chromium process with the corrected six-tab launch list, Z.AI and Kimi require manual sign-in in the current session.
- Six harmless exact-response prompts: PENDING successful `test_connection` for every provider.

## Known limitations

- Browser consumers depend on each site's current DOM and terms. Selector/UI drift, sign-out, CAPTCHA, rate limit, unavailable account session, or service failure returns a retryable failure; it cannot guarantee uninterrupted access.
- Browser-product context, output, and message quotas are often unpublished and account-dependent. See `MODEL-LIMITS.md`; API capacities are not attributed to browser sessions.
- Chromium-family browsers only. Windows and Linux x64 desktop sessions are supported; Firefox, Safari, ARM, headless Linux, Alpine/musl, and locked Linux keyrings are not.
- Startup minimization uses Chromium's `--start-minimized` flag and a hidden Windows startup host. Window-manager/browser policy can override minimization.
- This private package is unsigned. Its manifest, checksum, dependency audit, and secret scan reduce risk but are not a formal security certification.

The source publication target is the public Git repository only. The private ZIP is not uploaded or sent to a package registry.
