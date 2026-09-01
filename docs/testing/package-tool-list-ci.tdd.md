# Package tool-list CI regression

Date: 2026-09-01

## User journey

As a maintainer, I want the packaged MCP protocol check to accept every
intentional public tool so Windows and Linux package workflows report the real
package status.

## Red

After rebuilding the Regular package, `npm run test:package` failed at
`scripts/test-regular-package.mjs:92`. The installed server returned the
intentional `omni_usage` tool in addition to `omni_models`, `omni_route`, and
`omni_routes`, while the stale assertion expected only the original three.

```text
actual:   [ 'omni_models', 'omni_route', 'omni_routes', 'omni_usage' ]
expected: [ 'omni_models', 'omni_route', 'omni_routes' ]
```

## Green

The expected public tool list now includes `omni_usage`. Rerunning
`npm run test:package` against the same freshly built Windows package returned
`"status": "PASS"`, including checksum, install/reinstall, MCP discovery and
invocation, routing, reconnect, redaction, detach, and uninstall checks.

This is an assertion-only correction: no runtime tool or provider behavior was
changed.
