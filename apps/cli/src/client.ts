import { readFile } from "node:fs/promises";
import type { OmniConfig, RuntimePaths } from "@omniroute/config";
import { getRuntimePaths, loadConfig } from "@omniroute/config";
import type { ModelEntry, RouteRequest, RouteResult } from "@omniroute/contracts";
import { SafeError } from "@omniroute/observability";
import { ensureLocalDaemonToken, type KeyProtector } from "@omniroute/vault";

export class DaemonClient {
  readonly #paths: RuntimePaths;
  readonly #protector: KeyProtector | undefined;
  #config: OmniConfig | null = null;
  #token: string | null = null;

  constructor(paths = getRuntimePaths(), protector?: KeyProtector) {
    this.#paths = paths;
    this.#protector = protector;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { config, token } = await this.connection();
    let response: Response;
    try {
      response = await fetch(`http://${config.daemon.host}:${config.daemon.port}${path}`, {
        ...init,
        redirect: "error",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
      });
    } catch (error) {
      throw new SafeError("DAEMON_UNREACHABLE", `Cannot connect to the local OmniRoute daemon: ${(error as Error).message}`, 503);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { code?: string; message?: string } };
      throw new SafeError(payload.error?.code ?? "DAEMON_ERROR", payload.error?.message ?? `Daemon returned HTTP ${response.status}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  async streamRoute(route: RouteRequest, onEvent: (event: string, data: unknown) => void): Promise<RouteResult> {
    const { config, token } = await this.connection();
    let response: Response;
    try {
      response = await fetch(`http://${config.daemon.host}:${config.daemon.port}/v1/routes`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(route),
      });
    } catch (error) { throw new SafeError("DAEMON_UNREACHABLE", `Cannot connect to the local OmniRoute daemon: ${(error as Error).message}`, 503); }
    if (!response.ok || !response.body) throw new SafeError("DAEMON_ERROR", `Daemon streaming request failed with HTTP ${response.status}`, response.status);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let event = "message";
    let data: string[] = [];
    let result: RouteResult | null = null;
    let failure: SafeError | null = null;
    const dispatch = (): void => {
      if (data.length === 0) return;
      const text = data.join("\n");
      let value: unknown = text;
      try { value = JSON.parse(text) as unknown; } catch { /* retain text */ }
      onEvent(event, value);
      if (event === "result") result = value as RouteResult;
      if (value && typeof value === "object") {
        const detail = value as { code?: string; message?: string; error?: string; status?: number };
        if (event === "route.failed") failure = new SafeError("DAEMON_ROUTE_FAILED", typeof detail.error === "string" ? detail.error : "Route failed");
        if (event === "error") failure = new SafeError(typeof detail.code === "string" ? detail.code : "DAEMON_ERROR", typeof detail.message === "string" ? detail.message : failure?.message ?? "Daemon route failed", typeof detail.status === "number" ? detail.status : 502);
      }
      event = "message"; data = [];
    };
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      while (true) {
        const index = buffer.indexOf("\n");
        if (index < 0) break;
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (!line) dispatch();
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
    }
    dispatch();
    if (failure) throw failure;
    if (!result) throw new SafeError("DAEMON_STREAM_INCOMPLETE", "Daemon stream ended without a final result");
    return result;
  }

  async models(): Promise<ModelEntry[]> {
    const snapshot = await this.request<{ models: ModelEntry[] }>("/v1/models");
    return snapshot.models;
  }

  async recentRoutes(limit = 20): Promise<unknown[]> {
    return (await this.request<{ routes: unknown[] }>(`/v1/routes?limit=${Math.max(1, Math.min(limit, 100))}`)).routes;
  }

  async state(): Promise<{ pid: number; host: string; port: number; startedAt: string } | null> {
    try { return JSON.parse(await readFile(this.#paths.daemonState, "utf8")) as { pid: number; host: string; port: number; startedAt: string }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  private async connection(): Promise<{ config: OmniConfig; token: string }> {
    this.#config ??= await loadConfig(this.#paths);
    this.#token ??= await ensureLocalDaemonToken(this.#paths, this.#protector);
    return { config: this.#config, token: this.#token };
  }
}
