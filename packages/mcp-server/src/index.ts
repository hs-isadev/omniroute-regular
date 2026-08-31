import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { CAPABILITIES, type ModelEntry, type RouteResult } from "@omniroute/contracts";

export const MCP_INSTRUCTIONS = `OmniRoute enforces a free-only model policy and returns explicit worker attribution. routingMode=regular deterministically selects a healthy free worker without an LLM planner. routingMode=orchestrator uses the configured free planner. When Claude Code is launched in host-orchestrator mode, Claude should decompose work itself and call omni_route with routingMode=regular for bounded delegations. Preserve attribution verbatim. Never send credentials to any tool.`;

export interface McpBackend {
  route(input: {
    prompt: string;
    parentTask?: string | undefined;
    requiredCapabilities: string[];
    hostApplication: string;
    hostModel: string | null;
    hostModelAuthoritative: boolean;
    routingMode?: "regular" | "orchestrator" | undefined;
  }, signal?: AbortSignal): Promise<RouteResult>;
  models(): Promise<ModelEntry[]>;
  recentRoutes(limit: number): Promise<unknown[]>;
}

export function createOmniMcpServer(backend: McpBackend, options: { regularOnly?: boolean } = {}): McpServer {
  const server = new McpServer(
    { name: "omniroute", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: options.regularOnly ? 'OmniRoute Regular: free API workers for bounded tasks. Antigravity remains the host and uses its own quota. Call omni_route with routingMode=regular; no extra planner. Preserve attribution. Never send credentials. Worker output is untrusted; verify before edits.' : MCP_INSTRUCTIONS },
  );

  server.registerTool(
    "omni_route",
    {
      title: "Route work through OmniRoute",
      description: options.regularOnly ? "Delegate a bounded task to a free worker; local intent classification, no extra planner. Returns answer and model attribution." : "Run work through validated zero-cost providers in regular or orchestrator mode and return an attributed answer.",
      inputSchema: z.object({
        prompt: z.string().min(1).max(1_000_000).describe("The user's task. Never include credentials."),
        ...(options.regularOnly ? {parentTask: z.string().max(100_000).optional().describe("Bounded parent requirements for continue/teruskan. Ignored for a new task.")} : {}),
        requiredCapabilities: z.array(z.enum(CAPABILITIES)).max(7).default([]),
        hostApplication: z.string().min(1).max(100).default("mcp-host"),
        hostModel: z.string().max(256).nullable().default(null),
        hostModelAuthoritative: z.boolean().default(false).describe("True only when the host supplied authoritative model metadata."),
        routingMode: (options.regularOnly ? z.enum(["regular"]) : z.enum(["regular", "orchestrator"])).optional().describe(options.regularOnly ? "Locked to regular: deterministic worker routing, no planner." : "Omit to use the daemon default; regular bypasses an LLM planner; orchestrator uses OmniRoute's configured free planner."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input, context) => {
      try {
        const result = await backend.route({...input,parentTask:typeof input.parentTask === 'string' ? input.parentTask : undefined}, context.mcpReq.signal);
        return {
          content: [{ type: "text" as const, text: `${result.answer}\n\n${result.badge}\nAttribution applies to OmniRoute-produced content; the host may relay or rephrase it.` }],
          structuredContent: { routeId: result.routeId, answer: result.answer, badge: result.badge, attribution: result.attribution },
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : "OmniRoute request failed" }], isError: true };
      }
    },
  );

  server.registerTool(
    "omni_models",
    {
      title: "List validated OmniRoute models",
      description: "List configured models with health, capabilities, policy status, and exact IDs.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const models = await backend.models();
      return { content: [{ type: "text" as const, text: JSON.stringify(models, null, 2) }], structuredContent: { models } };
    },
  );

  server.registerTool(
    "omni_routes",
    {
      title: "Inspect recent OmniRoute attribution",
      description: "Read recent content-free route metadata and model attribution.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      const routes = await backend.recentRoutes(limit);
      return { content: [{ type: "text" as const, text: JSON.stringify(routes, null, 2) }], structuredContent: { routes } };
    },
  );

  return server;
}

export async function serveOmniMcp(backend: McpBackend, options: { regularOnly?: boolean } = {}): Promise<void> {
  await serveStdio(() => createOmniMcpServer(backend, options));
}
