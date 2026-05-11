export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
export interface ToolRouter {
    definition: ToolDefinition;
    call(args: Record<string, unknown>): Promise<unknown>;
}
export declare function assertAllowedArgs(tool: string, args: Record<string, unknown>, allowed: string[]): void;
export declare function requireString(tool: string, args: Record<string, unknown>, field: string): string;
export declare function optionalString(value: unknown): string | undefined;
export declare function optionalNumber(tool: string, args: Record<string, unknown>, field: string): number | undefined;
export declare function positiveInteger(value: number | undefined, fallback: number, field: string, tool: string): number;
export declare function optionalNumberArray(value: unknown, field: string, tool: string): number[] | undefined;
