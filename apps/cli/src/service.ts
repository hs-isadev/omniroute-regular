import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SafeError } from "@omniroute/observability";
import type { DaemonClient } from "./client.js";

function serviceScript(): string {
  return fileURLToPath(new URL("../../../installers/windows/dist/service-task.ps1", import.meta.url));
}

export function daemonEntry(): string {
  return fileURLToPath(new URL("../../daemon/dist/main.js", import.meta.url));
}

async function powershell(action: "install" | "start" | "status" | "uninstall", extra: string[] = []): Promise<string> {
  if (process.platform !== "win32") throw new SafeError("SERVICE_UNSUPPORTED", "Per-user automatic service installation is currently implemented for Windows only");
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", serviceScript(), "-Action", action, ...extra], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise(Buffer.concat(stdout).toString("utf8")) : reject(new SafeError("SERVICE_COMMAND_FAILED", Buffer.concat(stderr).toString("utf8") || `Service action failed with exit code ${code}`)));
  });
}

export class WindowsServiceManager {
  constructor(private readonly client: DaemonClient) {}

  plan(): Record<string, unknown> {
    return {
      taskName: "OmniRoute",
      trigger: "Current-user interactive logon",
      identity: `${process.env.USERDOMAIN ?? ""}\\${process.env.USERNAME ?? "current user"}`,
      runLevel: "LeastPrivilege",
      executable: `${process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows"}\\System32\\wscript.exe`,
      arguments: ["//B", "//Nologo", fileURLToPath(new URL("../../../installers/windows/dist/daemon-hidden.vbs", import.meta.url)), process.execPath, daemonEntry()],
      consoleWindow: false,
      restartPolicy: "3 attempts, one-minute interval",
      mutableState: "%LOCALAPPDATA%\\OmniRoute",
    };
  }

  async install(): Promise<void> {
    await powershell("install", ["-NodePath", process.execPath, "-DaemonPath", daemonEntry()]);
  }

  async start(): Promise<void> { await powershell("start"); }

  async stop(): Promise<void> {
    try { await this.client.request("/v1/service/stop", { method: "POST", body: "{}" }); }
    catch (error) { if (!(error instanceof SafeError) || error.code !== "DAEMON_UNREACHABLE") throw error; }
  }

  async status(): Promise<unknown> {
    const value = await powershell("status");
    return JSON.parse(value || "{}") as unknown;
  }

  async uninstall(): Promise<void> {
    await this.stop();
    await powershell("uninstall");
  }
}
