# Credentials and vault

## Safe workflow

1. Run `omni setup`.
2. Run `omni secrets template`.
3. Edit `%LOCALAPPDATA%\OmniRoute\import\credentials.txt` in a local text editor.
4. Run `omni secrets import`.
5. Run `omni service stop`, then `omni service start` to load new credentials.

Before importing any of the eight added hosted profiles, check the provider's
free-only account settings and run `omni providers enable ID --confirm-free-tier`.
See the [credential directory](free-credentials-directory.md) for signup links,
evaluation restrictions, and billing cautions. Confirmation cannot inspect billing.

Do not paste keys into chat, shell arguments, environment files in the
repository, screenshots, issue reports, or normal configuration. The checked-in
`credentials.import.txt.example` contains empty placeholders only.

The generated free-only template contains:

```text
OPENROUTER_API_KEY
GEMINI_API_KEY
GROQ_API_KEY
MISTRAL_API_KEY
COHERE_API_KEY
CLOUDFLARE_API_TOKEN
HF_TOKEN
VERCEL_AI_GATEWAY_API_KEY
NVIDIA_API_KEY
ZAI_API_KEY
OPENCODE_ZEN_API_KEY
CLOUDFLARE_ACCOUNT_ID
```

The parser retains legacy paid-provider field compatibility for an explicit
future opt-out from `routing.freeOnly`, but setup never asks for those fields
and the default configuration cannot enable or spend through them.

Unknown fields, duplicates, continuation lines, NUL bytes, malformed lines, and
incomplete key/endpoint pairs are rejected. Repository and synchronized-folder
locations generate warnings. The generated file receives an explicit
current-user Windows ACL.

## Encryption design

The vault generates a random 256-bit master key. Windows DPAPI with
`DataProtectionScope.CurrentUser` wraps that key. Each provider record is then
encrypted independently with AES-256-GCM, a unique 96-bit nonce, and associated
data containing the record version, provider ID, sorted field names, and
creation time. Authentication failure aborts decryption.

The vault file contains ciphertext, DPAPI-wrapped key material, authenticated
metadata, and a short SHA-256 fingerprint. It never contains plaintext or a
reversible encoding of a key. The daemon token is another independently
encrypted record.

Import builds a candidate vault, verifies provider connectivity, and atomically
replaces the active vault only after every imported provider passes. It then
overwrites, clears, removes, and recreates the local import template. If
verification fails, the active vault and plaintext import file remain unchanged
so the user can correct the local file.

## Commands

```powershell
omni secrets template
omni secrets import
omni secrets list
omni secrets test groq --live --budget-usd 0.01
omni secrets remove groq
omni secrets rotate openrouter
```

Explicit `secrets test` checks require `--live` and a positive budget authorization.
Import also validates connectivity; new providers use a tiny completion against
the confirmed free allowance. Z.AI health refreshes also consume a tiny amount.
Outputs
show provider names, field names, health, and masked fingerprints only.

## Limits

Secrets necessarily exist briefly in process memory. Guaranteed forensic
deletion is impossible on SSDs, filesystem journals, synchronized folders,
backups, crash dumps, clipboard history, or a compromised current-user session.
DPAPI does not protect against malware running as the same user or an
administrator.
