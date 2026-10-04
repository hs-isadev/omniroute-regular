import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { SafeError } from "@omniroute/observability";
import { ensureHarnessDaemon, localGatewayBaseURL } from "../apps/cli/src/local-daemon.js";

function offline(): SafeError {
  return new SafeError("DAEMON_UNREACHABLE", "offline", 503);
}

test("local gateway rejects a non-loopback daemon address", () => {
  assert.throws(() => localGatewayBaseURL({ daemon: { host: "203.0.113.10", port: 47831 } }), /loopback/i);
  assert.equal(localGatewayBaseURL({ daemon: { host: "127.0.0.1", port: 47831 } }), "http://127.0.0.1:47831/v1");
});

test("OpenCode harness reuses an authenticated local daemon without spawning another", async () => {
  let spawnCalls = 0;
  const gateway = await ensureHarnessDaemon({
    client: { request: async path => { assert.equal(path, "/v1/health"); return { ok: true }; } },
    config: { daemon: { host: "127.0.0.1", port: 47831 } },
    nodePath: "C:\\runtime\\node.exe",
    daemonPath: "C:\\runtime\\daemon.mjs",
    cwd: "C:\\workspace",
    environment: {},
    spawnImpl: () => { spawnCalls++; throw new Error("should not spawn"); },
    sleep: async () => {},
  });
  assert.equal(gateway.baseURL, "http://127.0.0.1:47831/v1");
  assert.equal(gateway.started, false);
  await gateway.close();
  assert.equal(spawnCalls, 0);
});

test("OpenCode harness starts and cleans up a private local daemon only when it is unreachable", async () => {
  const child = new EventEmitter() as EventEmitter & { killed?: boolean; kill: () => boolean; unref: () => void };
  let spawnCalls = 0, available = false, killed = false;
  child.kill = () => { killed = true; child.killed = true; return true; };
  child.unref = () => {};
  const gateway = await ensureHarnessDaemon({
    client: { request: async () => { if (!available) throw offline(); return { ok: true }; } },
    config: { daemon: { host: "127.0.0.1", port: 47831 } },
    nodePath: "C:\\runtime\\node.exe",
    daemonPath: "C:\\runtime\\daemon.mjs",
    cwd: "C:\\workspace",
    environment: { OMNIROUTE_HOME: "C:\\runtime" },
    spawnImpl: (command, args, options) => {
      spawnCalls++;
      available = true;
      assert.equal(command, "C:\\runtime\\node.exe");
      assert.deepEqual(args, ["C:\\runtime\\daemon.mjs"]);
      assert.equal(options.cwd, "C:\\workspace");
      assert.equal(options.env.OMNIROUTE_HOME, "C:\\runtime");
      return child;
    },
    sleep: async () => {},
  });
  assert.equal(gateway.started, true);
  assert.equal(spawnCalls, 1);
  await gateway.close();
  assert.equal(killed, true);
});

test("OpenCode harness reports an early local daemon process exit instead of waiting for the full startup timeout", async () => {
  const child = new EventEmitter() as EventEmitter & { killed?: boolean; kill: () => boolean; unref: () => void };
  child.kill = () => { child.killed = true; return true; };
  child.unref = () => {};
  let healthChecks = 0;
  await assert.rejects(ensureHarnessDaemon({
    client: { request: async () => { healthChecks++; throw offline(); } },
    config: { daemon: { host: "127.0.0.1", port: 47831 } },
    nodePath: "C:\\runtime\\node.exe",
    daemonPath: "C:\\runtime\\daemon.mjs",
    cwd: "C:\\workspace",
    environment: {},
    spawnImpl: () => {
      queueMicrotask(() => child.emit("exit", 1, null));
      return child;
    },
    sleep: async () => {},
  }), error => {
    assert.ok(error instanceof SafeError);
    assert.equal(error.code, "DAEMON_START_FAILED");
    assert.match(error.message, /The local OmniRoute daemon exited before becoming ready/);
    return true;
  });
  assert.equal(healthChecks, 7);
  assert.equal(child.killed, true);
});

test("OpenCode harness fails closed for an authenticated daemon error instead of spawning a replacement", async () => {
  let spawnCalls = 0;
  await assert.rejects(ensureHarnessDaemon({
    client: { request: async () => { throw new SafeError("DAEMON_AUTH_INVALID", "invalid local authorization", 401); } },
    config: { daemon: { host: "127.0.0.1", port: 47831 } },
    nodePath: "C:\\runtime\\node.exe",
    daemonPath: "C:\\runtime\\daemon.mjs",
    cwd: "C:\\workspace",
    environment: {},
    spawnImpl: () => { spawnCalls++; throw new Error("should not spawn"); },
    sleep: async () => {},
  }), /invalid local authorization/);
  assert.equal(spawnCalls, 0);
});
