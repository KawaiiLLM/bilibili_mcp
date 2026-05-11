import { type ApiEndpoint, type ApiFile, type ApiFileName } from "./types.js";
export declare function listApiFiles(): ApiFileName[];
export declare function loadApiFile(name: ApiFileName): Promise<ApiFile>;
export declare function clearApiCache(): void;
export declare function getEndpointAsync(file: ApiFileName, group: string, endpoint: string): Promise<ApiEndpoint>;
export declare function getEndpoint(file: ApiFileName, group: string, endpoint: string): ApiEndpoint;
