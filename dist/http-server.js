import { randomUUID } from "node:crypto";
import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
export async function startHttpServer(options) {
    const app = createMcpExpressApp({ host: options.host });
    app.use(express.json({ limit: "2mb" }));
    const transports = {};
    const mcpPath = options.mcpPath ?? "/mcp";
    const ssePath = options.ssePath ?? "/sse";
    const messagesPath = options.messagesPath ?? "/messages";
    app.all(mcpPath, async (req, res) => {
        try {
            const sessionIdHeader = req.headers["mcp-session-id"];
            const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
            let transport;
            if (sessionId && transports[sessionId] instanceof StreamableHTTPServerTransport) {
                transport = transports[sessionId];
            }
            else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (initializedSessionId) => {
                        transports[initializedSessionId] = transport;
                    },
                });
                transport.onclose = () => {
                    const sid = transport?.sessionId;
                    if (sid)
                        delete transports[sid];
                };
                await createServer().connect(transport);
            }
            else {
                res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32000,
                        message: "Bad Request: No valid session ID provided",
                    },
                    id: null,
                });
                return;
            }
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: error instanceof Error ? error.message : "Internal server error",
                    },
                    id: null,
                });
            }
        }
    });
    app.get(ssePath, async (_req, res) => {
        const transport = new SSEServerTransport(messagesPath, res);
        transports[transport.sessionId] = transport;
        res.on("close", () => {
            delete transports[transport.sessionId];
        });
        await createServer().connect(transport);
    });
    app.post(messagesPath, async (req, res) => {
        const sessionIdQuery = req.query.sessionId;
        const sessionId = Array.isArray(sessionIdQuery) ? sessionIdQuery[0] : sessionIdQuery;
        const transport = sessionId ? transports[String(sessionId)] : undefined;
        if (!(transport instanceof SSEServerTransport)) {
            res.status(400).send("No SSE transport found for sessionId");
            return;
        }
        await transport.handlePostMessage(req, res, req.body);
    });
    await new Promise((resolvePromise, reject) => {
        const httpServer = app.listen(options.port, options.host, () => resolvePromise());
        httpServer.on("error", reject);
    });
    console.error(`Bilibili MCP HTTP server listening on http://${options.host}:${options.port}`);
    console.error(`Streamable HTTP endpoint: ${mcpPath}`);
    console.error(`SSE endpoint: ${ssePath}`);
    console.error(`SSE messages endpoint: ${messagesPath}`);
}
//# sourceMappingURL=http-server.js.map