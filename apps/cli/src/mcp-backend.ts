import { CAPABILITIES, type Capability, type RouteRequest, type RouteResult, type TaskEnvelope, type TaskSubmission, type TaskVerification } from "@omniroute/contracts";
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
        ...(request.taskPacket ? {taskPacket: request.taskPacket} : {}),
        ...(request.selectionPin ? {selectionPin: {providerId: request.selectionPin.providerId, ...(request.selectionPin.modelId ? {modelId: request.selectionPin.modelId} : {})}} : {}),
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
    tasks: {
      submit: (input: TaskSubmission) => client.request<TaskEnvelope>("/v1/tasks", { method: "POST", body: JSON.stringify(input) }),
      status: (id: string) => client.request<TaskEnvelope>(`/v1/tasks/${encodeURIComponent(id)}`),
      inspectPlan: (id: string) => client.request<unknown>(`/v1/tasks/${encodeURIComponent(id)}/plan`),
      approve: (id: string, approvalId: string) => client.request<TaskEnvelope>(`/v1/tasks/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify({ approvalId }) }),
      pause: (id: string, reason?: string) => client.request<TaskEnvelope>(`/v1/tasks/${encodeURIComponent(id)}/pause`, { method: "POST", body: JSON.stringify({ ...(reason ? { reason } : {}) }) }),
      resume: (id: string) => client.request<TaskEnvelope>(`/v1/tasks/${encodeURIComponent(id)}/resume`, { method: "POST", body: "{}" }),
      cancel: (id: string, reason?: string) => client.request<TaskEnvelope>(`/v1/tasks/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ ...(reason ? { reason } : {}) }) }),
      inspectDiff: (id: string) => client.request<unknown>(`/v1/tasks/${encodeURIComponent(id)}/diff`),
      verify: (id: string, verification: Omit<TaskVerification, "at"> & { at?: string }) => client.request<TaskEnvelope>(`/v1/tasks/${encodeURIComponent(id)}/verify`, { method: "POST", body: JSON.stringify(verification) }),
      report: (id: string) => client.request<TaskEnvelope>(`/v1/tasks/${encodeURIComponent(id)}/report`),
    },
  };
}
