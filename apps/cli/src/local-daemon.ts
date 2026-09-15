import { spawn as spawnChild } from "node:child_process";
import { SafeError } from "@omniroute/observability";

export interface LocalDaemonConfig {
  daemon: {
    host: string;
    port: number;
  };
}

export interface DaemonHealthClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export interface SpawnedDaemon {
  killed?: boolean;
  kill(signal?: NodeJS.Signals): boolean;
  unref?(): void;
}

export interface SpawnDaemonOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  stdio: "ignore";
  windowsHide: boolean;
}

export interface LocalDaemonGateway {
  baseURL: string;
  started: boolean;
  close(): Promise<void>;
}

export interface EnsureHarnessDaemonOptions {
  client: DaemonHealthClient;
  config: LocalDaemonConfig;
  nodePath: string;
  daemonPath: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  spawnImpl?: (command: string, args: string[], options: SpawnDaemonOptions) => SpawnedDaemon;
  sleep?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
}

export function localGatewayBaseURL(config: LocalDaemonConfig): string {
  const { host, port } = config.daemon;
  if (host !== "127.0.0.1") throw new SafeError("HARNESS_LOCAL_GATEWAY_INVALID", "OpenCode regular mode requires a loopback OmniRoute daemon", 400);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new SafeError("HARNESS_LOCAL_GATEWAY_INVALID", "OpenCode regular mode requires a valid local daemon port", 400);
  return `http://${host}:${port}/v1`;
}

function isUnreachable(error: unknown): boolean {
  return error instanceof SafeError && error.code === "DAEMON_UNREACHABLE";
}

async function waitForLocalDaemon(client: DaemonHealthClient, maxAttempts: number, sleep: (milliseconds: number) => Promise<void>): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await client.request("/v1/health");
      return;
    } catch (error) {
      if (!isUnreachable(error)) throw error;
      if (attempt + 1 < maxAttempts) await sleep(100);
    }
  }
  throw new SafeError("DAEMON_UNREACHABLE", "The local OmniRoute daemon did not become ready for the OpenCode harness", 503);
}

export async function ensureHarnessDaemon({
  client,
  config,
  nodePath,
  daemonPath,
  cwd,
  environment,
  spawnImpl = spawnChild,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  maxAttempts = 100,
}: EnsureHarnessDaemonOptions): Promise<LocalDaemonGateway> {
  const baseURL = localGatewayBaseURL(config);
  try {
    await client.request("/v1/health");
    return { baseURL, started: false, close: async () => {} };
  } catch (error) {
    if (!isUnreachable(error)) throw error;
  }

  // A scheduled local daemon can be between process start and port bind. Give it
  // a short, bounded grace period before creating a separate private process.
  try {
    await waitForLocalDaemon(client, 5, sleep);
    return { baseURL, started: false, close: async () => {} };
  } catch (error) {
    if (!isUnreachable(error)) throw error;
  }

  const child = spawnImpl(nodePath, [daemonPath], { cwd, env: environment, shell: false, stdio: "ignore", windowsHide: true });
  child.unref?.();
  try {
    await waitForLocalDaemon(client, maxAttempts, sleep);
  } catch (error) {
    if (!child.killed) child.kill("SIGTERM");
    throw error;
  }
  return {
    baseURL,
    started: true,
    close: async () => { if (!child.killed) child.kill("SIGTERM"); },
  };
}
