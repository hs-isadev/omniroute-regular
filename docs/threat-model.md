# Threat model

## Assets and trust boundaries

Protected assets are provider credentials, the daemon bearer token, prompts,
answers, policy, attribution integrity, budget limits, and user host settings.
Provider responses, model-discovery metadata, planner output, hook input, compatible
base URLs, browser headers, imported files, and existing host configuration are
untrusted inputs.

The local OS user and Windows DPAPI profile are trusted. OmniRoute does not
claim protection against malware running as the same user, an administrator,
kernel compromise, memory inspection, or a compromised provider.

## Principal threats and controls

| Threat | Control |
|---|---|
| Secret disclosure in logs/errors | One central redactor, allowlisted import fields, safe error classes, content-free audit records, seeded leak tests |
| Repository or OneDrive secret sync | Real import file only under `%LOCALAPPDATA%`, broad ignore rules, sync/repository warnings |
| Vault theft | Random 256-bit master key wrapped with current-user DPAPI; independent AES-256-GCM records, unique 96-bit nonces and authenticated metadata |
| Torn vault/config write | Same-directory temp file, flush, atomic replace, validation before activation, recovery backup |
| Malicious planner output | Closed schema plus registry, capability, health, effort, token, DAG, fan-out, concurrency, and budget validation |
| Provider/model substitution | Exact configured IDs, no implicit paid fallback, and attempted fallbacks in attribution |
| Loopback request forgery | Random bearer token, Host/Origin allowlists, CSRF header, request/rate/concurrency limits |
| SSRF through compatible provider | HTTPS by default, explicit HTTP loopback exception, DNS/IP private-range rejection, no redirects, fixed API paths |
| Duplicate billable calls | Retry only classified transient failures, jittered capped delay, Retry-After, no retry after partial stream output |
| Integration corruption | Structural parse, managed ownership marker, timestamped backup, redacted dry-run, atomic write, rollback manifest, post-write validation |
| Hook abuse | Supported events only, absolute executable paths, fast deterministic output, normal Codex/Claude trust review, no bypass flags |
| Host-model misattribution | Record `unknown` unless authoritative host metadata is present |
| Denial of service | Body limits, per-client rate limits, queue/concurrency caps, timeouts, abort propagation, single-instance lock |

## Privacy disclosure

Orchestrator mode sends its configured provider either the request or a
sufficient routing summary before a worker may receive input. Regular mode
makes no planner call. Privacy mode removes optional content and truncates
context. Prompts/answers are retained only after explicit opt-in.

## Residual risk

DPAPI ciphertext is recoverable by processes acting as the same Windows user.
Secrets necessarily exist briefly in process memory. Plaintext deletion cannot
guarantee forensic erasure on SSDs, backup systems, sync clients, crash dumps,
clipboard history, or filesystem journals. Host applications may rephrase MCP
tool output after OmniRoute returns it.
