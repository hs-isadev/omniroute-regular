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

Pending the minimal expected-tool-list correction and a rerun of the same
freshly built package test.
