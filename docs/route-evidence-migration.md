# Route evidence migration

OmniRoute model records now include a `route` evidence object. It describes the
configured transport, free-status evidence, privacy class, terms location,
quota evidence, concurrency limit, allowed task classes, and the expiry of the
last discovery evidence. It does not expose credentials, browser sessions, or
the hidden backing model of an alias such as `openrouter/free`.

The built-in zero-price routes contain explicit `freeTierConfirmed: true`
evidence. A custom or older `freeTierOnly` route without that confirmation is
reported as `unknown` and cannot be selected in free-only mode. Add the flag
only after checking the account and provider terms; otherwise disable the route.

For confidential work, set `privacyMode: true` on the route request (or enable
the global privacy mode). Routes whose privacy class is unknown or whose
evaluation logging status is possible are then excluded. Local routes and
routes with an explicit provider-policy classification remain eligible.

Discovery evidence expires according to `providers[].discoveryTtlSeconds`.
The daemon refreshes the registry when an entry expires, even if the coarser
health-cache TTL has not elapsed. A configured model that receives the explicit
`model_permission_blocked_org` HTTP 403 response is quarantined for the current
daemon lifetime and the normal free ladder considers its remaining eligible
models; generic 401/403 credential failures still fail closed.
