import { getRuntimePaths, loadConfig } from "@omniroute/config";
import type { ModelEntry, RouteRequest, RouteResult } from "@omniroute/contracts";
import { serveOmniMcp } from "@omniroute/mcp-server";
import { ensureLocalDaemonToken } from "@omniroute/vault";

const paths = getRuntimePaths();
let connection: Promise<{ baseUrl: string; token: string }> | null = null;

async function daemonConnection(): Promise<{ baseUrl: string; token: string }> {
  connection ??= Promise.all([loadConfig(paths), ensureLocalDaemonToken(paths)]).then(([config, token]) => ({
    baseUrl: `http://${config.daemon.host}:${config.daemon.port}`,
    token,
  }));
  return connection;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = await daemonConnection();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: "error",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new Error(payload?.error?.message ?? `OmniRoute daemon returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

await serveOmniMcp({
  route: (input, signal) => {
    const route: RouteRequest = {
      prompt: input.prompt,
      sourceClient: "claude-desktop-mcpb",
      hostApplication: input.hostApplication || "claude-desktop",
      hostModel: input.hostModelAuthoritative ? input.hostModel : null,
      hostModelAuthoritative: input.hostModelAuthoritative,
      attachments: [],
      requestedCapabilities: input.requiredCapabilities as RouteRequest["requestedCapabilities"],
      maxOutputTokens: null,
      privacyMode: null,
      metadata: {},
    };
    return request<RouteResult>("/v1/routes", { method: "POST", body: JSON.stringify(route), signal });
  },
  models: async () => (await request<{ models: ModelEntry[] }>("/v1/models")).models,
  recentRoutes: async (limit) => (await request<{ routes: unknown[] }>(`/v1/routes?limit=${Math.max(1, Math.min(100, limit))}`)).routes,
});
