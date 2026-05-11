#!/usr/bin/env node
export declare function startStdioServer(): Promise<void>;
export declare function startHttpMode(): Promise<void>;
export declare function startDefaultServer(): Promise<void>;
export declare function checkConfig(): Promise<void>;
export declare function showHelp(): void;
export declare function main(argv?: string[]): Promise<void>;
export declare const cliPath: string;
