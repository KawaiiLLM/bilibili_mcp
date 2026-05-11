export interface HttpServerOptions {
    host: string;
    port: number;
    mcpPath?: string;
    ssePath?: string;
    messagesPath?: string;
}
export declare function startHttpServer(options: HttpServerOptions): Promise<void>;
