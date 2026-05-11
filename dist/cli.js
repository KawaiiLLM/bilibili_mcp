#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { program } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./core/config.js";
import { credentialManager } from "./core/credential.js";
import { startHttpServer } from "./http-server.js";
import { checkLoginStatus } from "./modules/auth.js";
import { server } from "./server.js";
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
export async function startStdioServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Bilibili MCP started with stdio transport");
    console.error("CookieCloud will be checked lazily when an authenticated tool is called");
}
export async function startHttpMode() {
    await startHttpServer({
        host: config.httpHost,
        port: config.httpPort,
        mcpPath: config.httpMcpPath,
        ssePath: config.httpSsePath,
        messagesPath: config.httpMessagesPath,
    });
}
export async function startDefaultServer() {
    if (config.transportMode === "stdio") {
        await startStdioServer();
        return;
    }
    await startHttpMode();
}
export async function checkConfig() {
    try {
        await credentialManager.initialize();
        const login = await checkLoginStatus();
        const status = credentialManager.getStatus();
        console.log("配置状态：可用");
        console.log(`登录状态：${login.isLogin ? "已登录" : "未登录"}`);
        console.log(`Cookie 来源：${status.source}`);
        console.log(`CookieCloud 地址：${status.endpoint}`);
        console.log(`刷新间隔：${status.refreshIntervalMinutes} 分钟`);
        console.log(`最近刷新：${status.refreshedAt ? new Date(status.refreshedAt).toISOString() : "尚未拉取"}`);
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
export function showHelp() {
    console.log(`bilibili-mcp ${packageJson.version}`);
    console.log("");
    console.log("Bilibili MCP Server - 基于 CookieCloud 的 B 站 MCP 服务");
    console.log("");
    console.log("用法：");
    console.log("  bilibili-mcp         启动 MCP 服务，默认使用 Streamable HTTP");
    console.log("  bilibili-mcp stdio   启动 stdio MCP 服务");
    console.log("  bilibili-mcp http    启动 Streamable HTTP/SSE 服务");
    console.log("  bilibili-mcp check   检查 CookieCloud 配置和登录态");
    console.log("  bilibili-mcp help    显示帮助");
    console.log("");
    console.log("说明：");
    console.log("  仅支持 CookieCloud，不支持手动 Cookie。");
    console.log("  list_tools 不预拉 CookieCloud，需要登录态的工具调用时才校验。");
    console.log("  Streamable HTTP 默认端点：/mcp；兼容 SSE 默认端点：/sse。");
}
export async function main(argv = process.argv) {
    program.name("bilibili-mcp").version(packageJson.version).description("Bilibili MCP Server");
    program.arguments("[command]").action(async (command) => {
        switch (command) {
            case "stdio":
                await startStdioServer();
                break;
            case "http":
                await startHttpMode();
                break;
            case "check":
                await checkConfig();
                break;
            case "help":
            case "--help":
            case "-h":
                showHelp();
                break;
            case "version":
            case "--version":
            case "-v":
                console.log(packageJson.version);
                break;
            case undefined:
                await startDefaultServer();
                break;
            default:
                console.error(`未知命令：${command}`);
                showHelp();
                process.exitCode = 1;
        }
    });
    program.command("stdio").description("启动 stdio MCP 服务").action(startStdioServer);
    program.command("http").description("启动 Streamable HTTP/SSE 服务").action(startHttpMode);
    program.command("check").description("检查 CookieCloud 配置").action(checkConfig);
    program.command("help").description("显示帮助").action(showHelp);
    await program.parseAsync(argv);
}
if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
    main().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
export const cliPath = fileURLToPath(import.meta.url);
//# sourceMappingURL=cli.js.map