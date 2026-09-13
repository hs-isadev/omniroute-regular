# Host-owned orchestration

The host owns the canonical task, plan, acceptance criteria, repository context,
local edits, approvals, verification and final synthesis. Workers produce bounded
drafts and never inherit the host conversation or filesystem. Their output is
untrusted; verify it against the current checkout and preserve the returned badge
and route ID when reporting verification.

In Codex prefer GPT-5.6 Sol for everyday orchestration, GPT-6 Astra for unusually
complex coordination, and Terra or another suitable available free worker for
bounded execution. These are host role preferences, not claims that OmniRoute can
invoke or detect the host model. Antigravity uses whichever host model is actually
selected and available there; do not assume Sol or Astra is available in Antigravity.
Host usage and worker quota are separate.

Skip delegation for trivial, coupled, sensitive or low-value work. For useful
independent work, estimate input and output tokens, obtain trustworthy context and
output limits from omni_models, and reserve room for instructions, response and
host synthesis. Unknown or insufficient limits mean shorten the packet or keep
the work with the host. Do not upload full transcripts, credentials, cookies or
unrelated private data. Browser consumers remain paced, small-only and excluded
from parallel implementation swarms.

The optional omni_route taskPacket field contains objective, excerpts (path/text),
constraints, acceptanceCriteria, requestedOutput, independent, worthwhile,
responseTokens, instructionReserveTokens and synthesisReserveTokens. The host
chooses the bounded excerpts. The runtime renders only these allowlisted fields,
deduplicates repeated excerpts/constraints and suppresses coupled/low-value work.
It checks the rendered packet plus reserves against the selected registry model's
actual context/output limits before execution. Task-packet requests suppress
automatic worker swarms; the host assembles and verifies the final result.

The exported prepareWorkerTask helper in the core runtime also provides a local
preflight result: shouldDelegate, a reason code, token estimates, contextLimit and
synthesisOwner=host. A rejected preflight returns no prompt. Budgeting uses a
conservative character-based estimate, not an exact provider tokenizer. Keep
additional margin for formats with poor token-estimation accuracy.

Use routingMode=regular; no additional LLM planner is required. Explicit pins
never bypass context, capabilities, task class, health, free-only or quota policy.
If no safe worker is available, the host keeps the work. Never enable paid fallback
or change browser identities, fingerprints or access controls to obtain traffic.
