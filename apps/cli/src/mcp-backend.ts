import { CAPABILITIES, type Capability, type RouteRequest, type RouteResult } from "@omniroute/contracts";
import type { McpBackend } from "@omniroute/mcp-server";
import { SafeError } from "@omniroute/observability";
import type { DaemonClient } from "./client.js";

export function createCliMcpBackend(client: Pick<DaemonClient, "request" | "models" | "recentRoutes" | "usageSummary">, enforcedMode = process.env.OMNIROUTE_ROUTING_MODE as RouteRequest["routingMode"] | undefined): McpBackend {
  return {
    route: (request, signal) => {
      if (enforcedMode && request.routingMode && request.routingMode !== enforcedMode) {
        throw new SafeError("MCP_ROUTING_MODE_LOCKED", `This MCP host is locked to ${enforcedMode} mode`, 400);
      }
      const routingMode = enforcedMode ?? request.routingMode;
      const route: RouteRequest = {
        prompt: request.prompt,
        ...(routingMode ? { routingMode } : {}),
        sourceClient: "omniroute-mcp",
        hostApplication: request.hostApplication,
        hostModel: request.hostModelAuthoritative ? request.hostModel : null,
        hostModelAuthoritative: request.hostModelAuthoritative,
        attachments: [],
        requestedCapabilities: request.requiredCapabilities.filter((item): item is Capability => CAPABILITIES.includes(item as Capability)),
        maxOutputTokens: null,
        privacyMode: null,
        metadata: {},
      };
      return client.request<RouteResult>("/v1/routes", { method: "POST", body: JSON.stringify(route), ...(signal ? { signal } : {}) });
    },
    models: () => client.models(),
    recentRoutes: (limit) => client.recentRoutes(limit),
    usageSummary: () => client.usageSummary(),
  };
}
