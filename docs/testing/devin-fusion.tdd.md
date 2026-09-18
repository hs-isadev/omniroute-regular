# Fusion control-plane TDD evidence

Source intent: the user-provided Fusion implementation prompt and the local
requirements matrix in `docs/devin-fusion-matrix.md`. No external CLI, account,
provider, or credential was used by these tests.

| Guarantee | RED evidence | GREEN evidence |
| --- | --- | --- |
| Durable envelopes validate state transitions, persist atomically, recover, deduplicate idempotent submission, and redact errors | `npm exec -- tsx --test tests/task-state.test.ts` failed because `PersistentTaskStore` was not exported | Same command passed: 3 tests |
| Context is selected by symbol, duplicate source bodies are omitted, and structured tool evidence is bounded deterministically | `npm exec -- tsx --test tests/context-planner.test.ts` failed because the planner exports did not exist | Build plus the focused test passed: 2 tests |
| Local executors are disabled by default and enforce exact declarations, workspace/environment policy, approval, redaction, and cancellation | `npm exec -- tsx --test tests/executor.test.ts` failed because `ControlledExecutor` was not exported | Build plus the focused test passed: 3 tests |
| Durable lifecycle operations are explicit and approval-gated | `npm exec -- tsx --test tests/task-lifecycle.test.ts` failed because `TaskLifecycle` was not exported | Build plus the focused test passed: 1 test |
| Daemon and MCP expose typed task lifecycle operations without changing `omni_route` | Focused endpoint/backend assertions were added | Daemon, MCP backend, and integration tests passed: 3 + 3 + 4 tests |
| Normal MCP-originated routing has a durable, prompt-redacted envelope | The daemon test initially failed because the response did not expose an automatic task ID | `tests/daemon.test.ts` passed: the task reached `completed`, recorded the exact selected model, and stored a passing attribution verification |
| OpenCode uses one exact currently eligible host model rather than a fixed pin | `tests/harness-env.test.ts` first failed because `selectOpenCodeHostModel` did not exist | The focused harness test passed: stale and paid candidates were rejected, one confirmed-free live-registry model became the only proxy and OpenCode model ID |
| Browser consumers stay small-only and their simulated confirmation is explicit | Provider catalog and routing diversity tests cover browser transport, confirmation, task class, and capacity gates | `npm run typecheck` and the focused provider catalog tests passed: 19 tests |
| Package builds cannot overlap and the repaired archive is usable | The former generated archive was verified to be missing `payload/node/node.exe` | `npm run package:regular` built 1,536 checked files; `npm run test:package` passed |

The repository does not define a coverage command, so no numerical coverage
claim is made. The final regression, security, and evaluation commands are
recorded separately with their actual results.
