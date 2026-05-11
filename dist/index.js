export { callTool, createServer, getTools, server } from "./server.js";
export { startHttpServer } from "./http-server.js";
export { main, startDefaultServer, startHttpMode, startStdioServer } from "./cli.js";
import { pathToFileURL } from "node:url";
import { main } from "./cli.js";
if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
    main().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map