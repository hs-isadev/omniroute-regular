# OmniRoute 0.6.4 — balanced routing and host orchestration

Regular routing now shares eligible free traffic across providers and equal-ranked models. Explicit pins/priorities, small-only browser limits, health, quotas, cooldowns and concurrency remain enforced. Content-free diagnostics distinguish selection, exclusion and genuine fallback.

This release also fixes browser-enabled MCP startup, adds minimized host task packets with context/output/instruction/synthesis budgets, and documents Sol/Astra/Terra host roles without claiming Antigravity can run unavailable models. GUI launchers hide package-owned consoles while preserving error dialogs; sign-in and security prompts remain visible.

Validation: 183 full core/integration tests passed; a final 15-test packet/routing run included one additional end-to-end packet test. Distribution: 131 passed, 2 skipped. Windows extracted install and genuine MCP protocol smoke passed using a fake provider. Both Windows/Linux payload manifests and 2,746 extracted files were inspected. Native Linux desktop/keyring and live Antigravity interactions are not claimed as tested.

Synthetic diversity: 36 equally eligible selections split 12/12/12 across Groq, Qwen and Kimi; nine fake-provider router requests split 3/3/3. Real traffic depends on eligibility and account/session availability. No live inference was sent to manufacture this distribution.

Download: OmniRoute-Private-0.6.4-private.1.zip (214,005,514 bytes). The historical Private filename is retained for version continuity; this is a shareable family runtime without user credentials or sessions.

SHA-256:

```text
22cebfd0d728fd1c5f536a0b08e2d68f109c0018019bbc411c765fdb5e8c0958  OmniRoute-Private-0.6.4-private.1.zip
```

This repository now distributes downloads and documentation. The original development checkout, tests, plans and source maps are not included. Required generated JavaScript/runtime launch assets and third-party dependencies remain inspectable as runnable application code. Older source-bearing downloads have been withdrawn; old release tags now resolve to the documentation-only tree. GitHub may retain historical objects/caches outside public refs.
