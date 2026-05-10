import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { formatToolError } from "./core/errors.js";
import { logger } from "./core/logger.js";
import { configToolRouter } from "./tools/config-tool.js";
import { discoveryToolRouter } from "./tools/discovery-tool.js";
import { interactionToolRouter } from "./tools/interaction-tool.js";
import { videoToolRouter } from "./tools/video-tool.js";
import type { ToolDefinition, ToolRouter } from "./tools/common.js";

const TOOL_ROUTERS: ToolRouter[] = [
  videoToolRouter,
  interactionToolRouter,
  discoveryToolRouter,
  configToolRouter,
];

const ROUTERS_BY_NAME = new Map(TOOL_ROUTERS.map((router) => [router.definition.name, router]));

export function getTools(): ToolDefinition[] {
  return TOOL_ROUTERS.map((router) => router.definition);
}

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const router = ROUTERS_BY_NAME.get(name);
  if (!router) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return router.call(args);
}

export function createServer(): Server {
  const server = new Server(
    {
      name: "bilibili-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const startedAt = Date.now();
    try {
      const result = await callTool(name, args as Record<string, unknown>);
      logger.toolResult(name, true, Date.now() - startedAt);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.toolResult(
        name,
        false,
        Date.now() - startedAt,
        error instanceof Error ? error.message : String(error),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(formatToolError(error), null, 2) }],
        isError: true,
      };
    }
  });

  return server;
}

export const server = createServer();
